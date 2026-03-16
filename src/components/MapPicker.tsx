'use client';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';

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

// Internal component to handle map centering and panning
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
    // Force invalidation to fix "gray tiles" bug
    setTimeout(() => map.invalidateSize(), 150);
  }, [center, map]);
  return null;
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
  const [initialCenter] = useState<[number, number]>([1.417327, 124.982531]);

  const handleLocate = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
      }, (err) => alert("Error: " + err.message));
    }
  };

  return (
    <div className="h-80 md:h-96 w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner group relative">
      <MapContainer 
        center={initialCenter} 
        zoom={16} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%' }}
        className="z-10"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker lat={lat} lng={lng} onChange={onChange} />
        {lat && lng && (
          <>
            <MapController center={[lat, lng]} />
            <Circle 
              center={[lat, lng]} 
              radius={radius} 
              pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2 }} 
            />
          </>
        )}
      </MapContainer>
      
      {/* Floating Controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
         <button 
           type="button"
           onClick={handleLocate}
           className="bg-white p-2.5 rounded-xl shadow-lg border border-slate-200 text-blue-600 hover:bg-blue-50 transition-colors"
           title="Locate Me"
         >
           <Crosshair size={20} />
         </button>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/80 backdrop-blur-md px-4 py-1.5 rounded-full text-[10px] font-bold text-white shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest border border-white/10">
        Tap Map to Pin Location
      </div>
    </div>
  );
}