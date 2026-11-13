import js from '@eslint/js';
const nodeGlobals=Object.fromEntries(['console','process','Buffer','fetch','AbortSignal','AbortController','URL','URLSearchParams','setTimeout','clearTimeout','setInterval','clearInterval','performance','crypto'].map(name=>[name,'readonly']));
export default [
 {ignores:['node_modules/**','coverage/**','uploads/**']},js.configs.recommended,
 {files:['**/*.{js,mjs}'],languageOptions:{ecmaVersion:2024,sourceType:'module',globals:nodeGlobals},rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_',ignoreRestSiblings:true}]}},
 {files:['public/**/*.js','tools/**/*.js'],languageOptions:{globals:{document:'readonly',window:'readonly',confirm:'readonly'}}},
];
