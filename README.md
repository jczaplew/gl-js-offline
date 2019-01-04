# Mapbox GL JS Offline
Utilities and source providers for creating and managing offline tile caches with [Mapbox GL JS](https://www.mapbox.com/mapbox-gl-js)

Features:
+ Seamless fallback to offline tiles. If a source is declared as `offline-<type>`
and contains cached tiles, those will always be used before a network request is made.
This not only reduces network load but does not require the user to toggle a separate
map or style to use offline maps.  

+ Stores tiles in IndexedDB, which is [widely supported](https://caniuse.com/#feat=indexeddb)
in modern browsers.  

+ Not a fork of Mapbox GL JS  

+ Cordova/Ionic friendly

__IMPORTANT:__ you are responsible for following the terms of service associated
with the tile providers you are caching. If you are caching Mapbox tiles please
be aware that at the time of writing the limit is [6,000 tiles](https://www.mapbox.com/help/mobile-offline/#tile-ceiling--limits)
per device.

## Installation
Installation goes here  

## Usage  
Usage goes here  


## API

### OfflineManager(map, accessToken, props, callback)
Class for managing offline map caches. Also sets up special source types   
+ `map` - an instance of a Mapbox GL JS map
+ `accessToken` - a valid Mapbox access token. Used for authenticating tile requests
+ `props` - database configuration object for IndexedDB
  + `dbname` - *optional, default `tile-cache`* - name of the database
  + `dbversion` - *optional, default `1.0`* - version of the database
  + `dbsize` - *optional, default `(1024*1024)*10`* - size of the database in bytes
  + `debug` - *optional, default `false`* - enable verbose creation and error logging
+ `callback(error)` - a callback called when the OfflineManager is set up

### .tile(zoom, lng, lat)  
Wrapper for `@mapbox/tile-cover` that returns the `[z, x, y]` of the tile at a
given location

### .getPack(name, callback)  
Retrieve information about a single cache by name  
+ `name` - __required__ - the name of the cache
+ `callback(error, info)` - __required__  
  + `error` - something went wrong fetching the pack
  + `info` - Object describing the cache

### .getPacks(callback)  
Retrieve all caches  
+ `callback(error, packs)`
  + `error` - something went wrong fetching the packs
  + `packs` - array of objects

### .deletePack(name, callback)  
Delete a single cache by name  
+ `name` - __required__ - the name of the cache to delete  
+ `callback(error)` - __required__
  + `error` - something went wrong while deleting the cache  

### .deletePacks(callback)  
Delete all existing caches  
+ `callback(error)` - __required__
  + `error` - something went wrong while deleting the caches  

### .makeCache(params, progressCallback, errorCallback, done)  
Create a new map cache. Returns an instance of `TileDownloadManager` that can be
used to abort the creation of the cache.  
+ `params` - __required__ - configuration object for cache  
  + `style` - __required__ - the Mapbox GL style object to cache. Must contain one or more valid `sources`  
  + `bounds` - __required__ - an array describing the bounding box to cache in the format `[minLng, minLat, maxLng, maxLat]`  
  + `minZoom` - __required__ - the minimum zoom level to cache  
  + `maxZoom` - __required__ - the maximum zoom level to cache  
  + `name` - *optional* - a name for the cache. Defaults to the current date and time  

+ `progressCallback(null, progress)` - __required__ - a callback used to monitor progress of the download  
  + `progress` - an object indicating cache progress  
    + `fetched` - the number of tiles successfully downloaded  
    + `total` - the total number of tiles to be downloaded  
    + `source` - the corresponding source the above statistics refer to  

+ `errorCallback(error)` - __required__ - callback used to monitor tile download errors  
  + `error` - an error object describing what went wrong  

+ `done(bytes)` - __required__ - callback used to indicate all sources in the style have been successfully downloaded  
  + `bytes` - the total number of bytes downloaded  

### .nTiles(params)  
Get the number of tiles needed for a given cache request. Useful for knowing a priori
how many tiles will be downloaded in order to abide by service limits and inform
the user of how large the download will be.  
+ `params` - __required__ - identical to those in `.makeCache()`  



## License
MIT
