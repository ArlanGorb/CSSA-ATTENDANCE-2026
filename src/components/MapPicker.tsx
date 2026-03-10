'use client';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect } from 'react';

// Fix for default Leaflet icon not showing
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  shadowSize: [41, 41]
});

function LocationMarker({ position, setPosition }: { position: { lat: number; lng: number }; setPosition: (pos: { lat: number; lng: number }) => void }) {
  const map = useMapEvents({
      click(e) {
          setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
          map.flyTo(e.latlng, map.getZoom());
      },
  });

  return position === null ? null : (
    <Marker position={[position.lat, position.lng]} icon={icon}></Marker>
  );
}

interface MapPickerProps {
    lat: number;
    lng: number;
    onChange: (pos: { lat: number; lng: number }) => void;
}

export default function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  // Default to Filkom if no loc
  const center = { lat, lng };

  return (
    <div className="h-[300px] w-full rounded-lg overflow-hidden border border-slate-200 z-0">
      <MapContainer center={[center.lat, center.lng]} zoom={15} scrollWheelZoom={true} style={{ height: "100%", width: "100%", zIndex: 0 }}>
        <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={center} setPosition={onChange} />
      </MapContainer>
    </div>
  );
}