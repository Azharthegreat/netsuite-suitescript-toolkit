-- On-hand and available quantity per item and location.
-- Needs the Multi-Location Inventory feature for location-level rows.
SELECT BUILTIN.DF(iil.item)     AS item,
       BUILTIN.DF(iil.location) AS location,
       iil.quantityonhand,
       iil.quantityavailable
  FROM inventoryitemlocations iil
 WHERE iil.quantityonhand <> 0
 ORDER BY item, location;


-- One item across every location (param: item internal id).
SELECT BUILTIN.DF(iil.location) AS location,
       iil.quantityonhand,
       iil.quantityavailable
  FROM inventoryitemlocations iil
 WHERE iil.item = ?
 ORDER BY location;
