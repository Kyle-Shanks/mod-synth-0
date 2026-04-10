export type ClassToken = string | false | null | undefined

export function classes(...tokens: ClassToken[]): string {
  return tokens.filter(Boolean).join(' ')
}
