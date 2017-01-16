# Harvest hour balance Chrome extension

Harvest hour balance extension fetches your Harvest hours and compares them to expected sum of hours.

By default it chooses the first day of current year as starting date, but you can customize it by picking a date from **Start date** calendar.

Hours from last two weeks are automatically re-fetched on every reload, so if you have entered hours for days prior those, use **Settings -> Reset all data** option to reset the cache and reload all hours.

## Installation

1. [Download Harvest.crx](https://github.com/SC5/harvestbalance-chrome/raw/master/dist/Harvest.crx)
2. Navigate to **chrome://extensions** and drag&drop downloaded **Harvest.crx** to your browser window.

## Settings

In **Settings** panel you can customize the day length, pick a holidays list and reset data.

**Day length** is used to calculate the expected hours (working days * day length).

**Holidays list** contains all days that are excluded from expected hours calculation. Currently holiday lists are hardcoded in source, see **HOLIDAYS** in **src/harvest.js** for available lists.

**Reset all data** button will clear the local storage and reload monthly balances from Harvest.

## Public holidays

All finnish public holidays are not counted as working days.
Additionally, Midsummer's Eve and Christmas Eve (24.12) are not counted as working days.

## Updating

Remember to reset your storage by hitting **Settings -> Reset all data** button after updating the plugin.

## Contributing

* Fork https://github.com/SC5/harvestbalance-chrome
* Clone it
* Navigate to **chrome://extensions**, enable **"Developer mode"**
* Drag & drop **app/** from your clone to your browser extensions window
* Hack to your heart's content
* Commit, push and send a PR to upstream

## Building app

`npm run build` will build `./src/harvest.js` to `./app/harvest.js` using Browserify.

## Build automatically on changes during development

`npm run watch` will watch `./src/harvest.js` for changes and update `./app/harvest.js` automatically.

**Remember that you'll still need to reload the extension in chrome://extensions**

## Running tests

`npm run test` will run the unit test suite for balance calculations, make sure your Node.js version supports needed ES6 features (`>= 5.0.0` should do fine) and that all tests pass before submitting PRs.

## License

MIT

Copyright © 2016 SC5 Online Ltd
