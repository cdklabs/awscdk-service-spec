import { JsonLens } from './json-lens';
import { JsonPatch } from './json-patch';
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
        const key = lastPart(lens.jsonPath);
        emit(`"${key}": `);
        block();
        indents.pop();
        emit('\n}');
      } else if (grampy.isJsonArray()) {
        emit('[\n');
        const ix = parseInt(lastPart(lens.jsonPath), 10);
        for (let i = 0; i < ix; i++) {
          emit('...,\n');
        }
        block();
        indents.pop();
        emit('\n]');
      }
    });
  }

  function emitPatch(lens: JsonLens, patch: JsonPatch) {
    if (lens.isJsonObject()) {
      indents.push('  ');
      emit('{\n');

      switch (patch.operation.op) {
        case 'add':
          emit(`<<[+]>>"${lastPart(patch.operation.path)}": ${JSON.stringify(patch.operation.value)},`);
          break;
        case 'copy':
          emit(`<<[+]>>"${lastPart(patch.operation.path)}": ${JSON.stringify(lens.value[patch.operation.from])},`);
          break;
        case 'move':
          const movedValue = lens.value[lastPart(patch.operation.from)];
          emit(`<<[-]>>"${lastPart(patch.operation.from)}": ${JSON.stringify(movedValue)},`);
          emit(`<<[+]>>"${lastPart(patch.operation.path)}": ${JSON.stringify(movedValue)},`);
          break;
        case 'remove':
          const removedValue = lens.value[lastPart(patch.operation.path)];
          emit(`<<[-]>>"${lastPart(patch.operation.path)}": ${JSON.stringify(removedValue)},`);
          break;
        case 'replace':
          const oldValue = lens.value[lastPart(patch.operation.path)];
          emit(`<<[-]>>"${lastPart(patch.operation.path)}": ${JSON.stringify(oldValue)},`);
          emit(`<<[+]>>"${lastPart(patch.operation.path)}": ${JSON.stringify(patch.operation.value)},`);
          break;
      }

      indents.pop();
      emit('\n}');
    } else {
      emit('Do not support printing this patch yet...');
    }
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
