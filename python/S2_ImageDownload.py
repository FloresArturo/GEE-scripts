import ee
ee.Authenticate()
ee.Initialize()
import geetools
import os
import geopandas as gpd
import geemap

'''
DOWNLOAD SENTINEL-2 IMAGES
The following program loads images from sentinel 2 between two dates, calculates several indices, and exports the images to a Google Drive folder.

Requires:
- Shapefile of the area of interest
- Start and end date to use as reference
- Google drive folder to save the images

Returns:
4 images as TIFF files including bands and indices as layers:
- 'blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2', 'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'
- each image represents the mean, median, min, and max values for every layer

Edit in lines: 197 - 200
'''


'''
DEFINED FUNCTIONS
'''
# define aoi
def generate_aoi (file_path):
    gdf=gpd.read_file(file_path)
    coord_syst = gdf.crs

    # transfor to epsg 4326
    if coord_syst != 'EPSG:4326':
        gdf = gdf.to_crs('EPSG:4326')
        print('TRANSFORMED TO EPSG:4326!')

    # border coordinates
    extent_coord = []
    border = gdf.geometry.boundary[0] # reads first row of the shapefile 
    for point in border.coords:
        lon, lat = point
        extent_coord.append((lon, lat))

    # generate aoi
    aoi = ee.Geometry.Polygon(extent_coord)
    print('GEOMETRY GENERATED!')

    return aoi

# cloud mask function
def maskS2clouds(image):
    qa = image.select('QA60') # selects "QA60" band, which contains the cloud mask information
    cloudBitMask = 1 << 10 # bit 10 of the band has cloud information
    cirrusBitMask = 1 << 11 # bit 11 contains cirrus information

    # set to 0 to indicate clear conditions
    mask = (qa.bitwiseAnd(cloudBitMask).eq(0).And(  
            qa.bitwiseAnd(cirrusBitMask).eq(0)))
    
    return image.updateMask(mask).divide(10000)

# clip images
def clipS2 (image):
    return image.clip(aoi)

# NDVI
def addNDVI (image) :
    ndvi = image.normalizedDifference(['nir', 'red']).rename('NDVI')
    return image.addBands(ndvi)
# SAVI
def addSAVI (image):
    savi = image.expression(
    '1.5*((NIR - RED)/(NIR+RED+0.5))',
    {'NIR' : image.select('nir')
    ,'RED' : image.select('red')
    }).rename('SAVI')
    return image.addBands(savi)
# EVI
def addEVI (image):
    evi = image.expression(
    '2.5 *((NIR-RED)/(NIR+6*RED-7.5*BLUE+1))',
    {'NIR': image.select('nir')
    ,'RED': image.select('red')
    ,'BLUE': image.select('blue')
    }).rename('EVI').float()
    return image.addBands(evi)
# GCI 
def addGCI (image):
    gci = image.expression(
    '(NIR) / (GREEN)-1',
    {'NIR': image.select('nir')
    ,'GREEN': image.select('green')
    }).rename('GCI').float()
    return image.addBands(gci)
# ARVI
def addARVI (image):
    arvi = image.expression(
    '(NIR-(RED-1*(BLUE-RED)))/(NIR+(RED-1*(BLUE-RED)))',
    {'NIR': image.select('nir')
    ,'RED': image.select('red')
    ,'BLUE': image.select('blue')
    }).rename('ARVI').float()
    return image.addBands(arvi)
# VARI
def addVARI (image):
    vari = image.expression(
    '(GREEN-RED)/(GREEN+RED-BLUE)',
    {'GREEN': image.select('green')
    ,'RED': image.select('red')
    ,'BLUE': image.select('blue')
    }).rename('VARI').float()
    return image.addBands(vari)

# function for downloading imagery
def getSentinel2 (Gdrive_folder, aoi_path, start_date, end_date):
    # generate aoi geometry
    aoi = generate_aoi(aoi_path)

    # get image collection
    imagery = (ee.ImageCollection('COPERNICUS/S2_SR')
               .filterDate(start_date, end_date)
               .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', 10)) #filter for images w/ <= 10 % cloud coverage
               .map(maskS2clouds)
               .select(['QA60', 'B2', 'B3', 'B4', 'B8', 'B8A', 'B9', 'B11', 'B12'],
                       ['QA60', 'blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2'])
               .map(addNDVI)
               .map(addSAVI)
               .map(addEVI)
               .map(addGCI)
               .map(addARVI)
               .map(addVARI)
               .filterBounds(aoi)           
               )
    
    # apply reducers
    mean = (imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2','NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .mean()
                  .clip(aoi)
    )
    
    median = (imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2','NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .median()
                  .clip(aoi)
    )

    min = (imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2','NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .min()
                  .clip(aoi)
    )

    max = (imagery.select(['blue', 'green', 'red', 'nir', 'rededge4', 'watervapor', 'swir1', 'swir2','NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                  .max()
                  .clip(aoi)
    )

    # export to drive
    file_names = ['mean', 'median', 'min', 'max']
    img_list = [mean, median, min, max]
    scale = 10
    region=aoi.coordinates().getInfo()

    for i, o in enumerate(img_list):
        collection = ee.ImageCollection((o))

        id = i
        name = "S2_"+file_names[id]

        task= geetools.batch.Export.imagecollection.toDrive(
            collection = collection, 
            folder = Gdrive_folder,
            namePattern= name,
            region= region,
            scale = scale, 
            verbose = True,
            maxPixels = int(1e13)
            )
        
    # print summary
    size = imagery.size().getInfo()
    sat = imagery.get('system:id').getInfo()

    print(f'{size} images used from {sat}.\nData interval between {start_date} and {end_date}')


'''
LOAD IMAGERY FROM SENTINEL-2
'''
### SET UP ###
# Gdrive_folder : folder created in Google Drive to use with GEE
# aoi_path : path to the shapefile that delimits the area of interest
# start date : date to start gathering images (min = 2017-03-28)
# en date : last day to stop gathering images (max = today)

s2 = getSentinel2(Gdrive_folder= 'folder_name',
                  aoi_path='path/to/shapefile.shp',
                  start_date='2022-01-01',
                  end_date='2023-06-30')   
