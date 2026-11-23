declare module "prismjs" {
  export type Token = string | { type: string; content: Token | Token[] };
  const prism: {
    languages: Record<string, object | undefined>;
    tokenize(source: string, grammar: object): Token[];
  };
  export default prism;
}
