#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Uso: create-snapshot.sh <version> (ex: 1.28.0)}"

# Converte pontos para hifens (Astro remove pontos dos slugs)
SLUG="v$(echo "$VERSION" | tr '.' '-')"
LABEL="v${VERSION}"
CONTENT_DIR="src/content/docs"
VERSIONS_FILE="src/config/versions.ts"
ASTRO_CONFIG="astro.config.mjs"

echo "Criando snapshot ${LABEL} (diretorio: ${SLUG})..."

# 1. Copiar latest/ para novo diretorio de versao
if [ -d "$CONTENT_DIR/$SLUG" ]; then
  echo "Erro: $CONTENT_DIR/$SLUG ja existe"
  exit 1
fi
cp -r "$CONTENT_DIR/latest" "$CONTENT_DIR/$SLUG"
echo "  Criado $CONTENT_DIR/$SLUG"

# 2. Atualizar versions.ts - adicionar nova entrada antes do ];
node -e "
const fs = require('fs');
const path = '$VERSIONS_FILE';
let content = fs.readFileSync(path, 'utf8');
const newEntry = \"  { slug: '$SLUG', label: '$LABEL', isCurrent: false },\";
// Insere antes do ]; final
content = content.replace(
  /^(\];)/m,
  newEntry + '\n\$1'
);
fs.writeFileSync(path, content);
console.log('  Atualizado ' + path);
"

# 3. Atualizar astro.config.mjs - inserir antes do marcador SNAPSHOT_INSERT_ABOVE
node -e "
const fs = require('fs');
const path = '$ASTRO_CONFIG';
let content = fs.readFileSync(path, 'utf8');
const marker = '// SNAPSHOT_INSERT_ABOVE';
if (!content.includes(marker)) {
  console.error('Erro: marcador SNAPSHOT_INSERT_ABOVE nao encontrado em ' + path);
  process.exit(1);
}
const newEntry = [
  '        {',
  \"          label: '$SLUG',\",
  '          collapsed: true,',
  \"          items: versionSidebar('$SLUG'),\",
  '        },',
].join('\n');
content = content.replace(marker, newEntry + '\n        ' + marker);
fs.writeFileSync(path, content);
console.log('  Atualizado ' + path);
"

echo ""
echo "Snapshot ${LABEL} criado com sucesso!"
echo "  - Diretorio: $CONTENT_DIR/$SLUG"
echo "  - versions.ts: entrada adicionada"
echo "  - astro.config.mjs: sidebar atualizada"
