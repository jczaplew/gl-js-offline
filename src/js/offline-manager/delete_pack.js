exports.deletePack = function (db, name, callback) {
  let tileTransaction = db.transaction('tiles', 'readwrite')
  let tileStore = tileTransaction.objectStore('tiles')

  tileStore.openCursor().onsuccess = (event) => {
    var cursor = event.target.result
    if (cursor) {
      if (cursor.value.cache === name) {
        let deleteTile = cursor.delete(cursor.value.tile_id)
        deleteTile.onsuccess = () => {
          cursor.continue()
        }
        deleteTile.onerror = () => {
          cursor.continue()
        }
      } else {
        cursor.continue()
      }
    } else {
      // Finally delete the cache record
      let cacheTransaction = db.transaction('caches', 'readwrite')
      let cacheStore = cacheTransaction.objectStore('caches')
      let deleteCache = cacheStore.delete(name)
      deleteCache.onsuccess = () => {
        callback(null)
      }
      deleteCache.onerror = () => {
        callback('Error deleting cache')
      }
    }
  }
}
