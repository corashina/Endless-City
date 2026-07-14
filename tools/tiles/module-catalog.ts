import type { ModuleDefinition, ModuleKind } from './types'

const ROTATIONS = [0, 1, 2, 3] as const
const module = (
  id: string, source: string, nodeName: string, kind: ModuleKind,
  width: number, depth: number,
): ModuleDefinition => ({
  id, source, nodeName, kind, anchor: 'bottom-center', footprint: { width, depth },
  allowedRotations: kind === 'surface' ? [0] : ROTATIONS,
})

export const MODULE_CATALOG = Object.freeze([
  module('house01', 'house.gltf', 'Building_House_01_color01.obj', 'building', 12.60, 17.89),
  module('house02', 'house2.gltf', 'Building_House_02_color01.obj', 'building', 17.58, 13.01),
  module('house03', 'residence.gltf', 'Building_House_03_color01.obj', 'building', 17.26, 14.41),
  module('house04', 'house3.gltf', 'Building_House_04_color01.obj', 'building', 24.77, 15.32),
  module('residential', 'apartments.gltf', 'Building_Residential_color01.obj', 'building', 12.66, 16.23),
  module('sky-small', 'apartments.gltf', 'Building_Sky_small_color01.obj', 'building', 13.07, 13.00),
  module('coffee-shop', 'coffeeshop.gltf', 'Building_Coffee_Shop.obj', 'building', 19.38, 12.46),
  module('bar', 'apartments.gltf', 'Building_Bar.obj', 'building', 7.41, 7.36),
  module('supermarket', 'supermarket.gltf', 'Building_Super_Market.obj', 'building', 13.25, 23.75),
  module('bakery', 'supermarket.gltf', 'Building_Bakery.obj', 'building', 11.28, 13.59),
  module('books', 'shoparea.gltf', 'Building_Books_Shop.obj', 'building', 12.04, 12.04),
  module('clothing', 'shoparea.gltf', 'Building_Clothing.obj', 'building', 12.13, 12.16),
  module('shoes', 'shoparea.gltf', 'Building_Shoes_Shop.obj', 'building', 12.04, 12.04),
  module('fruits', 'shoparea.gltf', 'Building_Fruits_Shop.obj', 'building', 12.13, 12.16),
  module('gas-station', 'gas.gltf', 'Building_Gas_Station.obj', 'building', 25.60, 13.00),
  module('auto-service', 'bus.gltf', 'Building_Auto_Service.obj', 'building', 8.26, 18.27),
  module('drug-store', 'shops.gltf', 'Building_Drug_Store.obj', 'building', 10.57, 11.22),
  module('gift-shop', 'supermarket.gltf', 'Building_Gift_Shop.obj', 'building', 10.57, 11.22),
  module('grass', 'park.gltf', 'Natures_Grass_Tile.obj', 'surface', 40, 40),
  module('concrete', 'shops.gltf', 'Road_Concrete_Tile.obj', 'surface', 40, 40),
  module('road-surface', 'factory.gltf', 'Road_Tile.obj', 'surface', 40, 40),
  module('big-tree', 'park.gltf', 'Natures_Big_Tree.obj', 'prop', 4.95, 5.15),
  module('bench-1', 'shops.gltf', 'Props_Bench_1.obj', 'prop', 4, 1.12),
  module('bench-2', 'park.gltf', 'Props_Bench_2.obj', 'prop', 4, 1.40),
  module('grass-fence', 'park.gltf', 'Natures_Grass_Fence.obj', 'prop', 1, 39.91),
  module('bush', 'park.gltf', 'Natures_Bush_01.obj', 'prop', 1.32, 1.29),
  module('rock', 'park.gltf', 'Natures_Rock_Big.obj', 'prop', 5.80, 5),
  module('coffee-chair', 'coffeeshop.gltf', 'Props_Coffee_shop_chair.obj', 'prop', 3.85, 3.85),
  module('cube-tree', 'apartments.gltf', 'Natures_Cube_Tree.obj', 'prop', 3.39, 3.19),
  module('fir-tree', 'house.gltf', 'Natures_Fir_Tree.obj', 'prop', 3.39, 3.92),
  module('parked-car', 'house.gltf', 'Vehicle_Car.obj', 'prop', 6.32, 2.96),
  module('pickup-truck', 'gas.gltf', 'Vehicle_Pick_up_Truck.obj', 'prop', 3.10, 5.97),
  module('police-car', 'gas.gltf', 'Vehicle_Police_Car.obj', 'prop', 6.32, 2.96),
  module('delivery-truck', 'factory.gltf', 'Vehicle_Truck.obj', 'prop', 9.10, 3.63),
  module('hydrant', 'bus.gltf', 'Props_Hydrant.obj', 'prop', 0.44, 0.44),
  module('street-light', 'road.gltf', 'Props_Street_Light.obj', 'prop', 0.60, 2.53),
  module('stop-sign', 'bus.gltf', 'Props_Traffic_Sign_stop.obj', 'prop', 0.72, 0.07),
  module('barrier', 'supermarket.gltf', 'Props_Traffic_Control_Barrier_Fence.obj', 'prop', 3.60, 0.20),
  module('fence', 'house2.gltf', 'Props_Fence.obj', 'prop', 39.60, 0.16),
] satisfies readonly ModuleDefinition[])

export const MODULES_BY_ID = new Map(MODULE_CATALOG.map((entry) => [entry.id, entry]))
