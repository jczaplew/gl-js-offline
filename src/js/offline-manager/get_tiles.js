const cover = require('@mapbox/tile-cover')

exports.getTiles = (bounds, minZ, maxZ) => {
  let geom
  // If only two coordinates are passed treat it as a point
  if (bounds.length === 2) {
    geom = {
      "type": "Point",
      "coordinates": bounds
    }
  } else {
    geom = {
      "type": "Polygon",
      "coordinates": [[
        [bounds[0], bounds[1]],
        [bounds[0], bounds[3]],
        [bounds[2], bounds[3]],
        [bounds[2], bounds[1]],
        [bounds[0], bounds[1]]
      ]]
    }
  }

  let tiles = []
  while (minZ <= maxZ) {
    // return as [ z, x, y ]
    tiles = tiles.concat(cover.tiles(geom, {
      min_zoom: minZ,
      max_zoom: minZ
    }).map(t => { return [t[2], t[0], t[1]] }))
    minZ++
  }

  return tiles
}
