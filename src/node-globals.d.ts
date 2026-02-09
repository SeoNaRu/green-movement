// 최소한의 Node 전역/코어 모듈 타입 선언
// - @types/node를 설치하지 않은 환경에서도 타입 오류 없이 동작하도록 하기 위한 용도

declare const process: {
  env: {
    GITHUB_TOKEN?: string;
    GITHUB_USERNAME?: string;
    NODE_ENV?: string;
    [key: string]: string | undefined;
  } & Record<string, string | undefined>;
};

declare module "fs" {
  export function writeFileSync(...args: any[]): void;
}

declare module "url" {
  export function fileURLToPath(path: string | URL): string;
}

declare module "path" {
  export function dirname(p: string): string;
  export function join(...parts: string[]): string;
}

