import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Box, Typography, Alert } from '@mui/material';
import L from 'leaflet';

// Fix for default marker icons in webpack/vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

/**
 * Component to auto-fit map bounds to markers
 */
const FitBounds = ({ markers }) => {
  const map = useMap();
  
  React.useEffect(() => {
    if (markers && markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [markers, map]);
  
  return null;
};

/**
 * Map visualization component using react-leaflet
 * Displays geographic data with markers and popups
 */
const MapChart = ({ data, height = 400 }) => {
  // Process data to extract markers
  const markers = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    
    return data
      .map((item, index) => {
        // Try to find latitude and longitude fields
        const latFields = ['lat', 'latitude', 'Lat', 'Latitude', 'LAT', 'LATITUDE'];
        const lngFields = ['lng', 'lon', 'longitude', 'Lng', 'Lon', 'Longitude', 'LNG', 'LON', 'LONGITUDE'];
        
        let lat = null;
        let lng = null;
        
        // Find latitude
        for (const field of latFields) {
          if (item[field] !== undefined && item[field] !== null) {
            lat = parseFloat(item[field]);
            break;
          }
        }
        
        // Find longitude
        for (const field of lngFields) {
          if (item[field] !== undefined && item[field] !== null) {
            lng = parseFloat(item[field]);
            break;
          }
        }
        
        // Validate coordinates
        if (lat !== null && lng !== null && 
            !isNaN(lat) && !isNaN(lng) &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180) {
          return {
            id: index,
            lat,
            lng,
            data: item
          };
        }
        
        return null;
      })
      .filter(marker => marker !== null);
  }, [data]);
  
  // Calculate center position
  const center = useMemo(() => {
    if (markers.length === 0) return [0, 0];
    
    const avgLat = markers.reduce((sum, m) => sum + m.lat, 0) / markers.length;
    const avgLng = markers.reduce((sum, m) => sum + m.lng, 0) / markers.length;
    
    return [avgLat, avgLng];
  }, [markers]);
  
  if (markers.length === 0) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        <Typography variant="body2">
          No valid geographic coordinates found in the data.
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          Expected fields: lat/latitude and lng/lon/longitude with values between -90/90 and -180/180.
        </Typography>
      </Alert>
    );
  }
  
  return (
    <Box sx={{ height, width: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={markers.length === 1 ? 13 : 10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {markers.map((marker) => (
          <Marker key={marker.id} position={[marker.lat, marker.lng]}>
            <Popup>
              <Box sx={{ minWidth: 150, maxWidth: 300 }}>
                {Object.entries(marker.data).map(([key, value]) => (
                  <Box key={key} sx={{ mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {key}:
                    </Typography>
                    <Typography variant="caption" sx={{ ml: 1 }}>
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Popup>
          </Marker>
        ))}
        
        <FitBounds markers={markers} />
      </MapContainer>
      
      <Box sx={{ 
        position: 'absolute', 
        bottom: 10, 
        right: 10, 
        bgcolor: 'white', 
        px: 1, 
        py: 0.5, 
        borderRadius: 1,
        boxShadow: 1,
        zIndex: 1000
      }}>
        <Typography variant="caption">
          {markers.length} location{markers.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
    </Box>
  );
};

export default MapChart;

