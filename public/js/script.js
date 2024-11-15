const socket = io();

// Prompt for user's details
const userName = prompt("Please enter your name:") || "Anonymous User";
let destinationMarker = null;
let routingControl = null;

// Function to handle destination selection
function onMapClick(e) {
    const { lat, lng } = e.latlng;
    
    if (destinationMarker) {
        map.removeLayer(destinationMarker);
    }
    
    destinationMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            shadowSize: [41, 41]
        })
    }).addTo(map);
    
    destinationMarker.bindPopup("Destination").openPopup();
    
    // Update route if we have user's current position
    if (myCurrentPosition) {
        updateRoute(myCurrentPosition, [lat, lng]);
    }
}

// Initialize the map
const map = L.map("map").setView([0, 0], 16);

// Add a tile layer to the map
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "sandip"
}).addTo(map);

// Add routing control using OSRM
const updateRoute = (from, to) => {
    if (routingControl) {
        map.removeControl(routingControl);
    }
    
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(from[0], from[1]),
            L.latLng(to[0], to[1])
        ],
        routeWhileDragging: true,
        lineOptions: {
            styles: [{ color: '#00f', weight: 4 }]
        },
        createMarker: function() { return null; } // Don't create default markers
    }).addTo(map);
};

// Store markers and user data
const markers = {};
const userPaths = {};
const polylines = {};
let myCurrentPosition = null;

// Enable map clicking for destination selection
map.on('click', onMapClick);

if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        const { latitude, longitude } = position.coords;
        myCurrentPosition = [latitude, longitude];
        
        // Send location data
        socket.emit("send-location", { 
            latitude, 
            longitude, 
            userName
        });
        
        // Update route if destination is set
        if (destinationMarker) {
            const destLatLng = destinationMarker.getLatLng();
            updateRoute([latitude, longitude], [destLatLng.lat, destLatLng.lng]);
        }
    },
    (error) => {
        console.log(error);
    },
    {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
    });
} else {
    console.log("Geolocation is not supported by this browser.");
}

// Function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Listen for incoming location data from the server
socket.on("receive-location", (data) => {
    const { id, latitude, longitude, userName } = data;
    
    // Create or update path array
    if (!userPaths[id]) {
        userPaths[id] = [];
    }
    userPaths[id].push([latitude, longitude]);
    
    // Calculate distance to destination if it exists
    let distanceInfo = '';
    if (destinationMarker && id === socket.id) {
        const destLatLng = destinationMarker.getLatLng();
        const distance = calculateDistance(
            latitude, 
            longitude, 
            destLatLng.lat, 
            destLatLng.lng
        );
        distanceInfo = `<br>Distance to destination: ${distance.toFixed(2)} km`;
    }
    
    const popupContent = `
        <div style="text-align: center;">
            <b>${userName}</b>${distanceInfo}
        </div>
    `;
    
    if (markers[id]) {
        // Update existing marker
        markers[id].setLatLng([latitude, longitude]);
        markers[id].getPopup().setContent(popupContent);
        
        // Update path line
        if (polylines[id]) {
            polylines[id].setLatLngs(userPaths[id]);
        } else {
            polylines[id] = L.polyline(userPaths[id], {
                color: id === socket.id ? '#FF0000' : '#3388ff',
                weight: 3
            }).addTo(map);
        }
    } else {
        // Create new marker
        markers[id] = L.marker([latitude, longitude]).addTo(map);
        markers[id].bindPopup(popupContent).openPopup();
        
        // Create path line
        polylines[id] = L.polyline(userPaths[id], {
            color: id === socket.id ? '#FF0000' : '#3388ff',
            weight: 3
        }).addTo(map);
    }
    
    // Center map on user's own position
    if (id === socket.id) {
        map.setView([latitude, longitude]);
    }
});

// Remove user data when they disconnect
socket.on("user-disconnected", (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }
    
    if (polylines[id]) {
        map.removeLayer(polylines[id]);
        delete polylines[id];
        delete userPaths[id];
    }
});