[app]
# Название приложения (можно поменять)
title = Bunker Game
# Использовать новый путь к sdkmanager (для Buildozer 1.6+)
android.sdk_path = /home/runner/.buildozer/android/platform/android-sdk
android.accept_sdk_license = True
android.skip_update = False

# Короткое имя пакета (только строчные буквы, цифры и подчеркивания)
package.name = bunkergame

# Домен (стандартный для тестов)
package.domain = org.example

# Где лежат исходники (папка, где main.py)
source.dir = .

# Список расширений, которые нужно включить в сборку (важно для HTML, CSS, JS, JSON)
source.include_exts = py,png,jpg,kv,json,html,css,js,atlas

# Версия приложения
version = 0.1

# Зависимости Python. Здесь мы указываем python3 и ваши библиотеки
requirements = python3,aiohttp,python-socketio

# ГЛАВНАЯ НАСТРОЙКА: используем WebView вместо Kivy
# Это позволит открыть ваш веб-сервер в нативном окне Android [citation:1][citation:3]
p4a.bootstrap = webview

# Порт, который будет слушать ваш сервер внутри приложения
# По умолчанию WebView Bootstrap подключается к 5000
android.port = 5000

# Разрешения (обязательно INTERNET)
android.permissions = INTERNET

# Версия Android API (для стабильности)
android.api = 33

# Архитектуры
android.archs = arm64-v8a, armeabi-v7a

# Ориентация экрана (portrait для телефона)
orientation = portrait

# Иконка (если есть, иначе закомментируйте)
# icon.filename = %(source.dir)s/icon.png

# Заставка (можно не использовать)
# presplash.filename = %(source.dir)s/presplash.png

# Отключаем лишние зависимости, чтобы сборка была быстрее
android.allow_backup = True
