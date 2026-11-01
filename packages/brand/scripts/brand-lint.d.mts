export interface Finding {
  rule: string
  line: number
  text: string
  file?: string
}
export interface AppReport {
  app: string
  path: string
  files: number
  counts: Record<string, number>
  total: number
}
export const RULES: string[]
export function globToRegExp(glob: string): RegExp
export function lintText(text: string, file: string): Finding[]
export function run(options: { paths: string[]; block?: string[] }): { apps: AppReport[]; blocking: Finding[] }
