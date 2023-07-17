import ee
ee.Authenticate()
ee.Initialize()
import geetools
import os
import geopandas as gpd

'''
DOWNLOAD LANDSAT-8 IMAGES
The following program loads images from landsat 8 between two dates, calculates several indices, and exports the images to a Google Drive folder.

Requires:
- Shapefile of the area of interest
- Start and end date to use as reference
- Google drive folder to save the images

Returns:
4 images as TIFF files including bands and indices as layers:
- 'blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp', 'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'
- each image represents the mean, median, min, and max values for every layer

Edit in lines: 204 - 207
'''


'''
DEFINED FUNCTIONS
'''
# define geometry
def generate_aoi (file_path):
    gdf = gpd.read_file(file_path)
    coord_syst = gdf.crs

    # transform to epsg 4326
    if coord_syst != 'EPSG:4326':
        gdf = gdf.to_crs('EPSG:4326')
        print('TRANSFORMED TO EPSG:4326')

    # border coordinates
    extent_coord = []
    border = gdf.geometry.boundary[0]
    for point in border.coords:
        lon, lat = point
        extent_coord.append((lon, lat))

    # generate aoi
    aoi = ee.Geometry.Polygon(extent_coord)
    print('GEOMETRY GENERATED!')

    return aoi

# mask L8
def maskL8sr (image):
    qa = image.select('QA_PIXEL') # band with cloud information
    cloudShadowBitMask = 1 << 3
    cloudBitMask = 1 << 5

    # set to 0 for clear conditions
    mask = (qa.bitwiseAnd(cloudShadowBitMask).eq(0).And(qa.bitwiseAnd(cloudBitMask).eq(0)))
    
    # saturation mask
    saturationMask = image.select('QA_RADSAT').eq(0)

    # scaling factor
    opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2)
    thermalBands = image.select('ST_B10').multiply(0.00312802).add(146)

    return (image.addBands(opticalBands)
            .addBands(thermalBands)
            .updateMask(mask)
            .updateMask(saturationMask))

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
def getLandsat8 (Gdrive_folder, aoi_path, start_date, end_date):
    # generate aoi geometry
    aoi = generate_aoi(aoi_path)

    # get image collection
    imagery = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
               .filterDate(start_date, end_date)
               .filter(ee.Filter.lte('CLOUD_COVER', 10)) #filter for images w/ <= 10 % cloud coverage
               .map(maskL8sr)
               .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10'],
                       ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp'])
               .map(addNDVI)
               .map(addSAVI)
               .map(addEVI)
               .map(addGCI)
               .map(addARVI)
               .map(addVARI)
               .filterBounds(aoi)           
               )
    
    # reducers
    mean = (imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp', 'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
            .mean()
            .clip(aoi)
    )

    median = (imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp', 'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                    .median()
                    .clip(aoi)
    )

    min = (imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp', 'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                    .min()
                    .clip(aoi)
    )

    max = (imagery.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'surface_temp', 'NDVI', 'SAVI', 'EVI', 'GCI', 'ARVI', 'VARI'])
                    .max()
                    .clip(aoi)
    )

    # export to drive
    file_names = ['mean', 'median', 'min', 'max']
    img_list = [mean, median, min, max]
    scale = 10
    region = aoi.coordinates().getInfo()

    for i, o in enumerate(img_list):
        collection = ee.ImageCollection((o))

        id = i 
        name = "L8_"+file_names[id]

        task = geetools.batch.Export.imagecollection.toDrive(
            collection = collection,
            folder = Gdrive_folder,
            namePattern = name, 
            region = region,
            scale = scale, 
            verbose = True, 
            maxPixels = int(1e13)
        )

    # print summary
    size = imagery.size().getInfo()
    sat = imagery.get('system:id').getInfo()

    print(f'{size} images used from {sat}. n\Data interval between {start_date} and {end_date}')

'''
LOAD IMAGERY FROM LANDSAT-8
'''
### SET UP ###
# Gdrive_folder : folder created in Google Drive to use with GEE
# aoi_path : path to the shapefile that delimits the area of interest
# start date : date to start gathering images (min = 2013-03-18)
# en date : last day to stop gathering images (max = today)

l8 = getLandsat8(Gdrive_folder= 'AGRON665X',
                  aoi_path=r'C:\Users\artur\OneDrive - Iowa State University\4 Codes\DSM tutorial\tutorial\data\boundaries\farm.shp',
                  start_date='2022-01-01',
                  end_date='2023-06-30') 
