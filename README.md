# Harvest hour balance Chrome extension

Harvest hour balance extension fetches your Harvest hours and compares them to expected sum of hours.

By default it chooses the first day of current year as starting date, but you can customize it by picking a date from **Start date** calendar.

Hours from last two weeks are automatically re-fetched on every reload, so if you have entered hours for days prior those, use **Settings -> Reset all data** option to reset the cache and reload all hours.

## Installation

Navigate to **chrome://extensions** and drag&drop **dist/Harvest.crx** to your browser window.

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