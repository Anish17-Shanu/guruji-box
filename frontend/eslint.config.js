import tseslint from 'typescript-eslint';
export default [{ignores:['dist/**','node_modules/**','e2e/**']},...tseslint.configs.recommended,{rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-expressions':'off','prefer-const':'off'}}];
