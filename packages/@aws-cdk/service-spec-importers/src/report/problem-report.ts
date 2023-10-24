import { promises as fs } from 'fs';
import * as path from 'path';
import { Failure, errorMessage, failure } from '@cdklabs/tskb';
import { PatchReport, formatPatchReport } from '../patching';

export type ReportType = 'interpreting' | 'loading' | 'patch';

interface Report {
  readonly type: ReportType;
  readonly failure: Failure;
}

/**
 * A class to build a problem report for issues encountered during the spec import
 */
export class ProblemReport {
  public get totalCount(): number {
    return Object.values(this.counts).reduce((total, current) => total + current, 0);
  }

  public readonly counts: Record<ReportType, number> = {
    interpreting: 0,
    loading: 0,
    patch: 0,
  };
  public readonly patchesApplied = new Array<PatchReport>();
  private readonly reportMap = new Map<string, Report[]>();

  /**
   * Report a failure into the problem report
   */
  public reportFailure(aud: ReportAudience, type: ReportType, ...failures: Failure[]) {
    if (failures.length === 0) {
      return;
    }

    let lst = this.reportMap.get(aud.id);
    if (!lst) {
      lst = [];
      this.reportMap.set(aud.id, lst);
    }
    lst.push(...failures.map((f) => ({ failure: f, type })));
    this.counts[type] += failures.length;
  }

  public reportPatch(aud: ReportAudience, ...patches: PatchReport[]) {
    this.reportFailure(aud, 'patch', ...patches.map((p) => failure(formatPatchReport(p))));
    this.patchesApplied.push(...patches);
  }

  public forAudience(aud: ReportAudience) {
    return new BoundProblemReport(this, aud);
  }

  public async write(directory: string) {
    await fs.rm(directory, { force: true, recursive: true });
    await fs.mkdir(directory, { recursive: true });

    for (const [id, reportList] of this.reportMap.entries()) {
      await this.writeReportFile(path.join(directory, `${id}.txt`), id, reportList);
    }
  }

  private async writeReportFile(fileName: string, service: string, reportList: Report[]) {
    const lines = [];
    lines.push(
      `CDK found the following issues while trying to read the CloudFormation resource definition for ${service}:`,
    );

    const reportTypeOrder: ReportType[] = ['interpreting', 'loading', 'patch'];
    for (const type of reportTypeOrder) {
      const thisType = reportList.filter((r) => r.type === type);
      if (thisType.length === 0) {
        continue;
      }

      lines.push('');
      lines.push(`    *** ${type} ***`);
      lines.push('');
      for (const rep of thisType) {
        lines.push(errorMessage(rep.failure));
      }
    }

    await fs.writeFile(fileName, lines.join('\n'), { encoding: 'utf-8' });
  }
}

export class BoundProblemReport {
  constructor(private readonly report: ProblemReport, private readonly aud: ReportAudience) {}
  /**
   * Report a failure into the problem report
   */
  public reportFailure(type: ReportType, ...failures: Failure[]) {
    this.report.reportFailure(this.aud, type, ...failures);
  }
}

export class ReportAudience {
  public static fromCloudFormationResource(res: string) {
    const parts = res.split('::');
    return new ReportAudience(`AWS_${parts[1]}`);
  }

  constructor(public readonly id: string) {}
}
