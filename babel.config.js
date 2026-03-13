module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
    plugins: [
        // Custom import.meta transform that avoids the self-referencing _require bug
        // in babel-plugin-transform-import-meta when used with createRequire(import.meta.url)
        function importMetaToFilename() {
            return {
                visitor: {
                    MetaProperty(path) {
                        // Transform import.meta.url → __filename
                        // Transform import.meta alone → { url: __filename }
                        const { parent } = path;
                        if (parent.type === 'MemberExpression' && parent.property.name === 'url') {
                            path.parentPath.replaceWithSourceString('__filename');
                        }
                    },
                },
            };
        },
    ],
};
