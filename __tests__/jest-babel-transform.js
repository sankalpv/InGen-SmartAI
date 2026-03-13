/**
 * Custom Babel transform for Jest tests only.
 * 
 * This file lives in __tests__/ (not project root) to avoid Next.js
 * detecting a babel.config.js and switching from SWC to Babel for builds.
 * 
 * Key: Replaces import.meta.url → __filename to fix the self-referencing
 * _require TDZ bug in babel-plugin-transform-import-meta when used with
 * createRequire(import.meta.url).
 */
const { createTransformer } = require('babel-jest');

module.exports = createTransformer({
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
    plugins: [
        function importMetaToFilename() {
            return {
                visitor: {
                    MetaProperty(path) {
                        const { parent } = path;
                        if (parent.type === 'MemberExpression' && parent.property.name === 'url') {
                            path.parentPath.replaceWithSourceString('__filename');
                        }
                    },
                },
            };
        },
    ],
});
