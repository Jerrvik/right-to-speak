# Публикация и обновления

Постоянный Manifest URL для установки и проверки обновлений Foundry:

`https://raw.githubusercontent.com/Jerrvik/right-to-speak/main/src/right-to-speak/module.json`

Поле `manifest` внутри пакета указывает на этот же адрес. Поле `download` содержит адрес ZIP конкретной версии в GitHub Releases. Foundry читает постоянный манифест, сравнивает `version` и загружает архив из `download` при обновлении.

## Следующая версия

1. Изменить `version` и версионный адрес `download` в `src/right-to-speak/module.json`. Тег должен быть `v` + значение `version`, например `v0.1.0-beta.2`.
2. Обновить `RELEASE_NOTES.md`, README и отчёт о проверках. Пока трёхклиентный тест не пройден, оставить пометку BETA и предупреждение о приватности.
3. Выполнить `npm test`, `npm run build` и проверить `right-to-speak/module.json` внутри ZIP.
4. Зафиксировать и отправить изменения в `main`, затем создать и отправить тег новой версии. Workflow `.github/workflows/release.yml` повторно проверит версию, соберёт архив и создаст GitHub Release с `right-to-speak.zip` и `module.json`.
5. Проверить доступность постоянного манифеста и нового URL ZIP по HTTPS, равенство версий и успешное обновление в тестовой Foundry.

Не переставлять постоянный манифест на ссылку `releases/latest`: GitHub может не считать prerelease последним релизом. Не менять ZIP уже опубликованной версии; исправления выпускаются новым номером версии.
