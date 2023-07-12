//DOWNLOAD S2 IMAGERY USING SHP OF AOI
// Load shp or draw geometry (comment or uncomment as follows)
// var aoi = table // use if uploading a shp
var aoi = geometry // use if drawing a geometry

// LINES TO EDIT
// 92 - 93 = change start and end date
// 135 - 137 = change scale, image description, and output folder

// Center map to object
Map.centerObject(aoi).addLayer(aoi, {}, "AOI extent")

// SETUP FUNCTIONS
// create cloud mask function
function maskS2clouds(image) {
  var qa = image.select('QA60'); // selects "QA60" band, which contains the cloud mask information
  var cloudBitMask = 1 << 10; // bit 10 of the band has cloud information
  var cirrusBitMask = 1 << 11; // bit 11 contains cirrus information
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0) // set to 0 to indicate clear conditions
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000); 
}
// clip function
function clip_s2 (image){
  return image.clip(aoi);
}
// multiply function (use to expand scale [-0.0001,0.0001] to [-10000, 10000])
function multiply (image){
  return image.multiply(10000);
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
    {'NIR' : image.select('nir')
    ,'RED' : image.select('red')
    }).rename('SAVI');
    return image.addBands(savi);
}
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

// LOAD IMAGERY FROM SENTINEL-2 SURFACE REFLECTANCE
// 1. Set date (starting from 2017-03-28)
var start_date = '2021-01-01';
var end_date = '2021-01-31';

// 2. Load S2 imagery
var imagery = ee.ImageCollection('COPERNICUS/S2_SR')
                   .filterDate(start_date, end_date)
                   .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', 5)) // filter for images with <= 5 % of cloud coverage
                   .map(maskS2clouds)
                   .select(['QA60', 'B2', 'B3', 'B4', 'B8', 'B8A', 'B9', 'B11', 'B12'],
                           ['QA60', 'blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2'])
                   .map(addNDVI)
                   .map(addSAVI)
                   .map(addEVI)
                   .map(addGCI)
                   .map(addARVI)
                   .map(addVARI)
                   .map(multiply)
                   .filterBounds(aoi)
print(imagery)

// 3. Use reducers
// mean values
var mean = imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2'
                          ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                      .mean()
                      .clip(aoi);
// median values
var median = imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2'
                            ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                      .median()
                      .clip(aoi);
// min values
var min = imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2'
                          ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                      .min()
                      .clip(aoi);
// min values
var max = imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2'
                         ,'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                      .max()
                      .clip(aoi);

// Download the stack
var scale = '10'
var description = 'S2' // change name as desired
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

var selection = 'NDVI' // enter the name of the band to visualize
//
var visParam = {
  min: 0.0,
  max: 10000.0,
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
