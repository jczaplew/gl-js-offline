# Mapbox GL JS Offline
Utilities and source providers for creating and managing offline tile caches with [Mapbox GL JS](https://www.mapbox.com/mapbox-gl-js)

## Installation
Installation goes here  

## Usage  
Usage goes here  


## API

### OfflineManager(map, props, callback)
Class for managing offline map caches. Also sets up special source types   
+ `map` - an instance of a Mapbox GL JS map
+ `props` - database configuration object for IndexedDB
  + `dbname` - *default `tile-cache`* - name of the database
  + `dbversion` - *default `1.0`* - version of the database
  + `dbsize` - *default `(1024*1024)*10`* - size of the database in bytes
  + `debug` - *default `false`* - enable verbose creation and error logging
+ `callback(error)` - a callback called when the OfflineManager is set up

### .tile(zoom, lng, lat)  
Wrapper for `@mapbox/tile-cover` that returns the `[z, x, y]` of the tile at a
given location

### .getPack(name, callback)  
Retrieve information about a single cache by name  
+ `name` - *required* - the name of the cache
+ `callback(error, info)` - *required*  
  + `error` - something went wrong fetching the pack
  + `info` - Object describing the cache

### .getPacks(callback)  
Retrieve all caches  
+ `callback(error, packs)`
  + `error` - something went wrong fetching the packs
  + `packs` - array of objects

### .deletePack(name, callback)  
Delete a single cache by name  
+ `name` - *required* - the name of the cache to delete  
+ `callback(error)` - *required*
  + `error` - something went wrong while deleting the cache  

### .deletePacks(callback)  
Delete all existing caches  
+ `callback(error)` - *required*
  + `error` - something went wrong while deleting the caches  

### .makeCache(params, progressCallback, errorCallback, done)  
Create a new map cache. Returns an instance of `TileDownloadManager` that can be
used to abort the creation of the cache.  
+ `params` - *required* - configuration object for cache  
  + `style` - *required* - the Mapbox GL style object to cache. Must contain one or more valid `sources`  
  + `bounds` - *required* - an array describing the bounding box to cache in the format `[minLng, minLat, maxLng, maxLat]`  
  + `minZoom` - *required* - the minimum zoom level to cache  
  + `maxZoom` - *required* - the maximum zoom level to cache  
  + `name` - __optional__ - a name for the cache. Defaults to the current date and time  

+ `progressCallback(null, progress)` - *required* - a callback used to monitor progress of the download  
  + `progress` - an object indicating cache progress  
    + `fetched` - the number of tiles successfully downloaded  
    + `total` - the total number of tiles to be downloaded  
    + `source` - the corresponding source the above statistics refer to  

+ `errorCallback(error)` - *required* - callback used to monitor tile download errors  
  + `error` - an error object describing what went wrong  

+ `done(bytes)` - *required* - callback used to indicate all sources in the style have been successfully downloaded  
  + `bytes` - the total number of bytes downloaded  




## License
MIT
