import { JsonLens } from './json-lens';
import { JsonPatch } from './json-patch';
import { PatchReport } from './patching';

/**
 * Format a patch report in a print friendly way
 */
export function formatPatchReport(report: PatchReport): string {
  const parts = new Array<string>();
  const indents = new Array<string>();
  parts.push(`${report.fileName}\n`);
  parts.push(`--------------------------------\n`);
  parts.push(`${report.path}: ${report.reason}\n`);

  indents.push('  '); // To put the -, + markers into later

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
        emit('}');
      } else if (grampy.isJsonArray()) {
        emit('[\n');
        const ix = parseInt(lastPart(lens.jsonPath), 10);
        for (let i = 0; i < ix; i++) {
          emit('...,\n');
        }
        block();
        emit(']');
      }

      indents.pop();
    });
  }

  function emitPatch(lens: JsonLens, patch: JsonPatch) {
    if (lens.isJsonObject()) {
      switch (patch.operation.op) {
        case 'add':
          emit(`[[+]]"${patch.operation.path}": ${JSON.stringify(patch.operation.value)},`);
          break;
        case 'copy':
          emit(`[[+]]"${patch.operation.path}": ${JSON.stringify(lens.value[patch.operation.from])},`);
          break;
        case 'move':
          const movedValue = lens.value[patch.operation.from];
          emit(`[[-]]"${patch.operation.from}": ${JSON.stringify(movedValue)},`);
          emit(`[[+]]"${patch.operation.path}": ${JSON.stringify(movedValue)},`);
          break;
        case 'remove':
          const removedValue = lens.value[patch.operation.path];
          emit(`[[-]]"${patch.operation.path}": ${JSON.stringify(removedValue)},`);
          break;
        case 'replace':
          const oldValue = lens.value[patch.operation.path];
          emit(`[[-]]"${patch.operation.path}": ${JSON.stringify(oldValue)},`);
          emit(`[[+]]"${patch.operation.path}": ${JSON.stringify(patch.operation.value)},`);
          break;
      }
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
   * Move anything in the special marker [[...]] to the front of the line
   */
  function moveMarkersToFront(x: string): string {
    const re = /^(\s+)\[\[([^\]])\]\]/gm;
    return x.replace(re, (_, spaces: string, sym: string) => `${sym}${spaces.substring(0)}`);
  }
}

function lastPart(x: string) {
  const parts = x.split('/');
  return parts[parts.length - 1];
}
