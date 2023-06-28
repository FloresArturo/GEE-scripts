// DOWNLOAD S2 IMAGERY USING SHP OF AOI
// Load shp or draw geometry (comment or uncomment as follows)
// var aoi = table // for uploaded shapefiles
var aoi = geometry // for drawn geometries

// LINES TO EDIT
// 97 - 98 = change start and end date
// 139 - 141 = change scale, image description, and output folder


// Center map to AOI
Map.centerObject(aoi).addLayer(aoi, {}, 'AOI extent')

// mask L8
function maskL8sr (image){
  // mask for clouds
  var cloudShadowBitMask = 1<<3;
  var cloudsBitMask = 1<<5;
  // get QA pixel band (contains info about clouds)
  var qa = image.select('QA_PIXEL');
  // set flags to zero to indicate clear conditions
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
               .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
               
  var saturationMask = image.select('QA_RADSAT').eq(0);
               
  // scaling factors
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2); // multiply by scale and add offset
  var thermalBands = image.select('ST_B10').multiply(0.00341802).add(149);
               
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true)
              .updateMask(mask)
              .updateMask(saturationMask);
}

// INDICES FUNCTIONS:
// the following lines create functions that calculate each index,
// take an image / select the bands to calculate the index / create a layer of the index results /
// returns the original image with the index as a new band
// NDVI 
var addNDVI = function(image){
  var ndvi = image.normalizedDifference(['nir', 'red']).rename('NDVI');
  return image.addBands(ndvi);
}
// SAVI
var addSAVI = function(image){
  var savi = image.expression(
    '1.5*((NIR - RED)/(NIR+RED+0.5))',
    {'NIR': image.select('nir')
    ,'RED': image.select('red')
    }).rename('SAVI');
    return image.addBands(savi).float();
};
// EVI
var addEVI = function(image){
  var evi = image.expression(
    '2.5 *((NIR-RED)/(NIR+6*RED-7.5*BLUE+1))',
    {'NIR': image.select('nir')
    ,'RED': image.select('red')
    ,'BLUE': image.select('blue')
    }).rename('EVI').float();
    return image.addBands(evi);
};
// GCI 
var addGCI = function(image){
  var gci = image.expression(
    '(NIR) / (GREEN)-1',
    {'NIR': image.select('nir')
    ,'GREEN': image.select('green')
    }).rename('GCI').float();
    return image.addBands(gci);
};
// ARVI
var addARVI = function(image){
  var arvi = image.expression(
    '(NIR-(RED-1*(BLUE-RED)))/(NIR+(RED-1*(BLUE-RED)))',
    {'NIR': image.select('nir')
    ,'RED': image.select('red')
    ,'BLUE': image.select('blue')
    }).rename('ARVI').float();
    return image.addBands(arvi);
};
// VARI
var addVARI = function(image){
  var vari = image.expression(
    '(GREEN-RED)/(GREEN+RED-BLUE)',
    {'GREEN': image.select('green')
    ,'RED': image.select('red')
    ,'BLUE': image.select('blue')
    }).rename('VARI').float();
    return image.addBands(vari);
};

// LOAD IMAGERY FROM LANDSAT 8
// 1. Set start and end date (starting from 2013-03-18)
var start_date = '2021-01-01'
var end_date = '2021-12-31'

// 2. Get Landsat imagery
var imagery = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                .filterDate(start_date, end_date)
                .filter(ee.Filter.lte('CLOUD_COVER', 10)) // filter images with <=10% of cloud cover
                .map(maskL8sr)
                .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5','SR_B6', 'SR_B7', 'ST_B10'],
                        ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp'])
                .map(addNDVI)
                .map(addSAVI)
                .map(addEVI)
                .map(addGCI)
                .map(addARVI)
                .map(addVARI)
                .filterBounds(aoi);
print(imagery)

// 3. Use reducers
// mean
var mean = imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp'
                          ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .mean()
                  .clip(aoi);
// median
var median = imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp'
                          ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .median()
                  .clip(aoi);
// min
var min = imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp'
                          ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .min()
                  .clip(aoi);
// max
var max = imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp'
                          ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .max()
                  .clip(aoi);
                  
// Download the stack
var scale = '10'
var description = 'L8' // change name as desired
var folder_name = 'AGRON665X' // change name to your output folder
// mean
Export.image.toDrive({
      image: mean,
      description: description + '_mean', // change this part according to your desire
      scale: scale,
      folder: folder_name,
      'crs': 'EPSG:4326', 
      region: aoi,
      maxPixels: 1e13
    });
// median
Export.image.toDrive({
      image: median,
      description: description + '_median', // change this part according to your desire
      scale: scale,
      folder: folder_name,
      'crs': 'EPSG:4326', 
      region: aoi,
      maxPixels: 1e13
    });
// min
Export.image.toDrive({
      image: min,
      description: description + '_min', // change this part according to your desire
      scale: scale,
      folder: folder_name,
      'crs': 'EPSG:4326', 
      region: aoi,
      maxPixels: 1e13
    });
// max
Export.image.toDrive({
      image: max,
      description: description + '_max', // change this part according to your desire
      scale: scale,
      folder: folder_name,
      'crs': 'EPSG:4326', 
      region: aoi,
      maxPixels: 1e13
    });
    
// VISUALIZATION OF RESULTS
// Available bands to visualize :
// ['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2',
// 'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI']
var selection = 'EVI' // enter the name of the band to visualize
//
var visParam = {
  min: 0.0,
  max: 1.8,
  palette: [
    'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
    '66A000', '529400', '3E8601', '207401', '056201', '004C00', '023B01',
    '012E01', '011D01', '011301'
  ],
};
print(mean, 'mean')
print(median, 'median')
print(min, 'min')
print(max, 'max')
Map.addLayer(mean.select(selection), visParam, 'mean')
Map.addLayer(median.select(selection), visParam, 'median')
Map.addLayer(min.select(selection), visParam, 'min')
Map.addLayer(max.select(selection), visParam, 'max')