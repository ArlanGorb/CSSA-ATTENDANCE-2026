'use client';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';

// Fix for default marker icons in Leaflet + Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

function LocationMarker({ lat, lng, onChange }: { lat: number | null, lng: number | null, onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return lat && lng ? (
    <Marker position={[lat, lng]} />
  ) : null;
}

export default function MapPicker({ lat, lng, radius, onChange }: MapPickerProps) {
  const [center, setCenter] = useState<[number, number]>([1.417327, 124.982531]); // Default to UNKLAB or previous

  useEffect(() => {
    if (lat && lng) {
      setCenter([lat, lng]);
    }
  }, [lat, lng]);

  return (
    <div className="h-64 w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner group">
      <MapContainer 
        center={center} 
        zoom={16} 
        scrollWheelZoom={false} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker lat={lat} lng={lng} onChange={onChange} />
        {lat && lng && (
          <Circle 
            center={[lat, lng]} 
            radius={radius} 
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2 }} 
          />
        )}
      </MapContainer>
      <div className="absolute top-2 right-2 z-[1000] bg-white/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-slate-500 shadow-sm border border-slate-100 pointer-events-none group-hover:opacity-0 transition-opacity">
        CLICK TO SET LOCATION
      </div>
    </div>
  );
}