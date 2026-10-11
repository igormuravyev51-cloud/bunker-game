[app]
# Название приложения
title = Bunker Game

# Короткое имя пакета (только строчные буквы, цифры, подчеркивания)
package.name = bunkergame

# Домен (стандартный для тестов)
package.domain = org.example

# Где лежат исходники (папка, где main.py)
source.dir = .

# Список расширений, которые нужно включить в APK
source.include_exts = py,png,jpg,kv,json,html,css,js,atlas

# Исключения (не тащим в APK лишнее)
source.exclude_dirs = tests,bin,.git,.github,__pycache__,venv,env
source.exclude_patterns = *.pyc,*.pyo,*.log

# Версия приложения
version = 0.1

# Зависимости Python
requirements = python3,aiohttp,python-socketio

# Bootstrap — WebView (наш веб-сервер показываем в нативном окне)
p4a.bootstrap = webview

# Порт, который слушает наш aiohttp-сервер внутри приложения
android.port = 5000

# Разрешения
android.permissions = INTERNET

# Версия Android API
android.api = 33
android.minapi = 21
android.ndk_api = 21

# Архитектуры
android.archs = arm64-v8a, armeabi-v7a

# Ориентация экрана
orientation = portrait

# Принимать лицензии SDK автоматически — ЭТО КЛЮЧЕВАЯ СТРОКА
android.accept_sdk_license = True
android.sdk_path = /usr/local/lib/android/sdk

# Не пропускать обновление SDK (заставляет buildozer самому поставить sdkmanager)
android.skip_update = False

# Иконка (раскомментируй, если положишь icon.png в корень)
# icon.filename = %(source.dir)s/icon.png

# Заставка (раскомментируй, если положишь presplash.png в корень)
# presplash.filename = %(source.dir)s/presplash.png

# Разрешить бэкап
android.allow_backup = True

# Отключаем лишние проверки, чтобы сборка не падала
android.check_sdk = False

# Логи buildozer
log_level = 2

# Папка для готового APK
bin_dir = ./bin

# Кэш
build_dir = ./.buildozer
