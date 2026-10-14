import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", ".data/**", "next-env.d.ts"] },
];

export default config;
