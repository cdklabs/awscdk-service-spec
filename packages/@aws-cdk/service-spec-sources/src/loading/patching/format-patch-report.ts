import { Operation } from 'fast-json-patch';
import { JsonLens } from './json-lens';
import { PatchReport } from './patching';

/**
 * Format a patch report in a print friendly way
 */
export function formatPatchReport(report: PatchReport): string {
  const parts = new Array<string>();
  const indents = new Array<string>();
  emit(`${report.fileName.trimEnd()}\n`);
  emit(`--------------------------------\n`);
  emit(`${report.path || '/'}: ${report.reason}\n`);

  indents.push('    '); // To put the [-], [+] markers into later
  emit(indents[0]);

  emitParentThen(report.subject, () => {
    emitPatch(report.subject, report.patch);
  });

  return moveMarkersToFront(parts.join('').trimEnd());

  function emitParentThen(lens: JsonLens, block: () => void) {
    if (lens.rootPath.length === 1) {
      return block();
    }

    const grampy = lens.rootPath[lens.rootPath.length - 2];
    emitParentThen(grampy, () => {
      indents.push('  ');

      if (grampy.isJsonObject()) {
        emit('{\n');
        const key = lastPart(lens.jsonPointer);
        emit(`"${key}": `);
        block();
        indents.pop();
        emit('\n}');
      } else if (grampy.isJsonArray()) {
        emit('[\n');
        const ix = parseInt(lastPart(lens.jsonPointer), 10);
        for (let i = 0; i < ix; i++) {
          emit('...,\n');
        }
        block();
        indents.pop();
        emit('\n]');
      }
    });
  }

  function emitPatch(lens: JsonLens, patch: Operation) {
    if (lens.isJsonObject()) {
      indents.push('  ');
      emit('{\n');

      const modifiedKey = lastPart(patch.op === 'move' ? patch.from : patch.path);

      emitPropertiesUntil(lens.value, modifiedKey, () => {
        switch (patch.op) {
          case 'add':
            emit(`<<[+]>>"${modifiedKey}": ${JSON.stringify(patch.value)},`);
            break;
          case 'copy':
            emit(`<<[+]>>"${modifiedKey}": ${JSON.stringify(lens.value[patch.from])},`);
            break;
          case 'move':
            const movedValue = lens.value[lastPart(patch.from)];
            emit(`<<[-]>>"${modifiedKey}": ${JSON.stringify(movedValue)},\n`);
            emit(`<<[+]>>"${lastPart(patch.path)}": ${JSON.stringify(movedValue)},`);
            break;
          case 'remove':
            const removedValue = lens.value[lastPart(patch.path)];
            emit(`<<[-]>>"${modifiedKey}": ${JSON.stringify(removedValue)},`);
            break;
          case 'replace':
            const oldValue = lens.value[lastPart(patch.path)];
            emit(`<<[-]>>"${modifiedKey}": ${JSON.stringify(oldValue)},\n`);
            emit(`<<[+]>>"${modifiedKey}": ${JSON.stringify(patch.value)},`);
            break;
        }
      });

      indents.pop();
      emit('\n}');
    } else {
      emit('Do not support printing this patch yet...');
    }
  }

  /**
   * Emit properties of the given object until we get to the given property
   */
  function emitPropertiesUntil(x: Record<string, unknown>, when: string, block: () => void) {
    let first = true;
    let invoked = false;
    for (const [key, value] of Object.entries(x)) {
      if (!first) {
        emit('\n');
      }
      first = false;

      if (key === when) {
        block();
        invoked = true;
      } else {
        emit(`"${key}": `);
        emitAbridged(value);
      }
    }

    if (!invoked) {
      if (!first) {
        emit('\n');
      }
      block();
    }
  }

  /**
   * Emit an abridged representation of this value
   */
  function emitAbridged(x: unknown) {
    if (Array.isArray(x)) {
      return emit(`[ ... ]`);
    }
    if (x && typeof x === 'object') {
      return emit(`{ ... }`);
    }
    return emit(JSON.stringify(x));
  }

  function emit(x: string): void {
    if (x === undefined) {
      debugger;
    }
    parts.push(x.replace(/\n/g, `\n${indents.join('')}`));
  }

  /**
   * Move anything in the special marker <<...>> to the front of the line
   */
  function moveMarkersToFront(x: string): string {
    const re = /^(\s*)<<([^>]*)>>/gm;
    return x.replace(re, (_, spaces: string, sym: string) => `${sym}${spaces.substring(sym.length)}`);
  }
}

function lastPart(x: string) {
  const parts = x.split('/');
  return parts[parts.length - 1];
}
