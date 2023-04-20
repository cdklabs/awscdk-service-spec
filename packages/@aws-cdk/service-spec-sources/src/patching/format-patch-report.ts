import { getValueByPointer } from 'fast-json-patch';
import { PatchReport } from './patching';

/**
 * Format a patch report in a print friendly way
 */
export function formatPatchReport(report: PatchReport): string {
  const modifiedPath = report.patch.op === 'move' ? report.patch.from : report.patch.path;
  const parts = new Array<string>();
  const indents = new Array<string>();
  emit(`${report.fileName.trimEnd()}\n`);
  emit(`--------------------------------\n`);
  emit(`${report.path || modifiedPath || '/'}: ${report.reason}\n`);

  indents.push('    '); // To put the [-], [+] markers into later
  emit(indents[0]);
  emitPatch(pointerHierarchy(modifiedPath));

  return moveMarkersToFront(parts.join('').trimEnd());

  /**
   * Emit a diff-like output for a given patch
   */
  function emitPatch(pointerStack: string[]): void {
    if (isJsonObject(report.subject)) {
      indents.push('  ');

      const currentProperty = lastPart(pointerStack[0]);
      if (currentProperty) {
        emit(`"${currentProperty}": `);
      }
      emit(`{\n`);

      // We render the change within sibling context
      if (pointerStack.length === 2) {
        emitChangeInContext(pointerStack[0]);
      } else {
        emitPatch(pointerStack.splice(1));
      }

      indents.pop();
      emit('\n}');
    } else {
      emit('Do not support printing this patch yet...');
    }
  }

  /**
   * Emit a change in the context of its siblings
   */
  function emitChangeInContext(at: string) {
    const modifiedKey = lastPart(modifiedPath);
    const parent = getValueByPointer(report.subject, at);
    const contextKeys = new Set(Object.keys(parent));
    contextKeys.add(modifiedKey);

    let remainingElements = contextKeys.size;
    for (const key of contextKeys) {
      if (key === modifiedKey) {
        emitChange(modifiedKey);
      } else {
        emitAbridgedProperty(key, parent[key]);
      }

      // On all but the last element
      if (--remainingElements !== 0) {
        emit('\n');
      }
    }
  }

  /**
   * Emit the actual change
   */
  function emitChange(modifiedKey: string) {
    switch (report.patch.op) {
      case 'add':
        emit(`<<[+]>>"${modifiedKey}": ${JSON.stringify(report.patch.value)}`);
        break;
      case 'copy':
        const copiedValue = getValueByPointer(report.subject, report.patch.from);
        emit(`<<[+]>>"${modifiedKey}": ${JSON.stringify(copiedValue)}`);
        break;
      case 'move':
        const movedValue = getValueByPointer(report.subject, report.patch.from);
        emit(`<<[-]>>"${modifiedKey}": ${JSON.stringify(movedValue)}\n`);
        emit(`<<[+]>>"${lastPart(report.patch.path)}": ${JSON.stringify(movedValue)}`);
        break;
      case 'remove':
        const removedValue = getValueByPointer(report.subject, report.patch.path);
        emit(`<<[-]>>"${modifiedKey}": ${JSON.stringify(removedValue)}`);
        break;
      case 'replace':
        const oldValue = getValueByPointer(report.subject, report.patch.path);
        emit(`<<[-]>>"${modifiedKey}": ${JSON.stringify(oldValue)}\n`);
        emit(`<<[+]>>"${modifiedKey}": ${JSON.stringify(report.patch.value)}`);
        break;
    }
  }

  /**
   * Emit an abridged representation of a property
   */
  function emitAbridgedProperty(key: string, value: unknown) {
    emit(`"${key}": `);
    emitAbridgedValue(value);
  }

  /**
   * Emit an abridged representation of this value
   */
  function emitAbridgedValue(x: unknown) {
    if (Array.isArray(x)) {
      emit(`[ ... ]`);
    } else if (isJsonObject(x)) {
      emit(`{ ... }`);
    } else {
      emit(JSON.stringify(x));
    }
  }

  /**
   * Emits a value into the buffer.
   * Converts newlines into indented newlines.
   */
  function emit(x: string): void {
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

/**
 * Get the last part of a JSON Pointer
 */
function lastPart(x: string) {
  const parts = x.split('/');
  return parts[parts.length - 1];
}

/**
 * Is this thing an object
 */
function isJsonObject(value: any): value is Record<string, unknown> {
  return typeof value === 'object' && value && !Array.isArray(value);
}

/**
 * Turns a JSON Pointer into a list of all ancestor paths:
 * /foo/bar/baz => ["", "/foo", "/foo/bar", "/foo/bar/baz"]
 */
function pointerHierarchy(path: string): string[] {
  return [
    '',
    ...path
      .split('/')
      .splice(1)
      .reduce((stack: string[], currentPart: string) => [...stack, `${stack.at(-1) ?? ''}/${currentPart}`], []),
  ];
}
