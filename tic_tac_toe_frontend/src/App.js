import React, { useState, useEffect, useRef } from "react";
import "./App.css";

/**
 * PUBLIC_INTERFACE
 * Main App component.
 * - Shows a minimal/modern Tic Tac Toe game UI.
 * - Animated, responsive weather map background from OpenWeatherMap based on user location.
 * - Handles geolocation, background tile fetching, board logic, UI state, and resets.
 */
function App() {
  // Theme control
  const [theme, setTheme] = useState("light");

  // Weather map related state
  const [coords, setCoords] = useState(null); // { lat, lon }
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  // Game logic state
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xIsNext, setXisNext] = useState(true);
  const [status, setStatus] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [animationFrame, setAnimationFrame] = useState(0);
  const animationIntervalRef = useRef(null);

  // Responsive canvas ref for map background
  const canvasRef = useRef(null);

  // Apply theme CSS var
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // On mount: try to get geolocation (once)
  useEffect(() => {
    if (!coords && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          setCoords({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          }),
        () => setMapError("Unable to get location – showing world map.")
      );
    }
    // fallback: show default world center
    if (!coords && !("geolocation" in navigator)) {
      setCoords({ lat: 0, lon: 0 });
      setMapError("Geolocation not available – showing world map.");
    }
  }, [coords]);

  // Handle location input submission
  const handleLocationSubmit = async (e) => {
    e.preventDefault();
    if (!locationInput.trim()) return;

    setIsLoadingLocation(true);
    setMapError("");

    try {
      const API_KEY = process.env.REACT_APP_OPENWEATHERMAP_API_KEY;
      if (!API_KEY) {
        throw new Error("Missing OpenWeatherMap API key");
      }

      const response = await fetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
          locationInput
        )}&limit=1&appid=${API_KEY}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch location coordinates");
      }

      const data = await response.json();
      if (!data.length) {
        throw new Error("Location not found");
      }

      const { lat, lon } = data[0];
      setCoords({ lat, lon });
    } catch (error) {
      setMapError(error.message);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Game logic: calculate status, winner, draw
  useEffect(() => {
    const winner = calculateWinner(board);
    if (winner) {
      setStatus(`Winner: ${winner}`);
      setGameOver(true);
    } else if (!board.includes(null)) {
      setStatus("It's a Draw!");
      setGameOver(true);
    } else {
      setStatus(`Turn: ${xIsNext ? "X" : "O"}`);
      setGameOver(false);
    }
  }, [board, xIsNext]);

  // Animated weather map background logic
  useEffect(() => {
    if (!coords) return;
    setMapReady(false);
    drawWeatherMapLoop();
    return () => {
      if (animationIntervalRef.current) {
        clearTimeout(animationIntervalRef.current);
      }
    };
    // eslint-disable-next-line
  }, [coords, theme]);

  // Animation loop for the weather map
  const drawWeatherMapLoop = () => {
    const API_KEY = process.env.REACT_APP_OPENWEATHERMAP_API_KEY;
    if (!API_KEY) {
      setMapError(
        "Missing OpenWeatherMap API key. Set REACT_APP_OPENWEATHERMAP_API_KEY in your env."
      );
      return;
    }
    // OpenWeatherMap tile docs: https://openweathermap.org/api/weathermaps
    const TILE_SIZE = 256;
    const ZOOM = 3; // Lower zoom = wider world, higher = more detail (clamped by OWM to 0-10, 6 is good for city)
    const ANIMATION_FRAMES = 6; // clouds_new/0..5; preloaded frames for clouds animation in OWM

    // Which weather/weather layer? Let's use animated clouds overlay (`clouds_new`) plus base map (osm)
    const weatherLayer = "clouds_new";
    const baseLayer = "osm";
    const frame = animationFrame % ANIMATION_FRAMES;

    // Center on user's coordinates (default: 0,0)
    const center = coords || { lat: 0, lon: 0 };
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Get actual viewport size
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // Helper: GPS => tile X/Y at zoom
    const lon2tile = (lon, z) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
    const lat2tile = (lat, z) =>
      Math.floor(
        ((1 -
          Math.log(
            Math.tan((lat * Math.PI) / 180) +
              1 / Math.cos((lat * Math.PI) / 180)
          ) /
            Math.PI) /
          2) *
          Math.pow(2, z)
      );

    const xCenter = lon2tile(center.lon, ZOOM);
    const yCenter = lat2tile(center.lat, ZOOM);

    // How many tiles fit in screen
    const tilesX = Math.ceil(w / TILE_SIZE) + 2; // +2 for overscan
    const tilesY = Math.ceil(h / TILE_SIZE) + 2;

    // Find top-left tile indices
    const xStart = xCenter - Math.floor(tilesX / 2);
    const yStart = yCenter - Math.floor(tilesY / 2);

    // For clearing previous frame
    const ctx = canvas.getContext("2d");
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);

    // Draw all base map & weather overlay as tiles
    let tilePromises = [];
    for (let dx = 0; dx < tilesX; dx++) {
      for (let dy = 0; dy < tilesY; dy++) {
        const x = xStart + dx;
        const y = yStart + dy;
        // Find where on screen
        const px = dx * TILE_SIZE - ((center.lon - tile2long(xCenter, ZOOM)) / (tile2long(xCenter + 1, ZOOM) - tile2long(xCenter, ZOOM))) * TILE_SIZE;
        const py = dy * TILE_SIZE - ((tile2lat(yCenter, ZOOM) - center.lat) / (tile2lat(yCenter, ZOOM) - tile2lat(yCenter + 1, ZOOM))) * TILE_SIZE;

        tilePromises.push(
          drawTile(ctx, baseLayer, ZOOM, x, y, px, py, 1.0, null, API_KEY)
        );
        if (weatherLayer) {
          tilePromises.push(
            drawTile(
              ctx,
              weatherLayer,
              ZOOM,
              x,
              y,
              px,
              py,
              weatherLayer === "clouds_new" ? 0.4 : 0.7,
              frame,
              API_KEY
            )
          );
        }
      }
    }

    Promise.all(tilePromises)
      .then(() => {
        setMapReady(true);
        setMapError("");
      })
      .catch(() => setMapError("Could not load weather map background"));

    setAnimationFrame((f) => (f + 1) % ANIMATION_FRAMES);
    animationIntervalRef.current = setTimeout(drawWeatherMapLoop, 1100); // ~1fps for OWM animated clouds
  };

  // Helper: tile X/Y/Z => lon/lat (for pixel offset calculation)
  function tile2long(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
  }
  function tile2lat(y, z) {
    var n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // Draw a single map tile (returns a Promise)
  function drawTile(
    ctx,
    layer,
    z,
    x,
    y,
    px,
    py,
    alpha,
    frame,
    API_KEY
  ) {
    // For non-weather layers, frame=null
    let url;
    if (frame === null || frame === undefined) {
      url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    } else {
      url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${API_KEY}&frame=${frame}`;
    }
    // If base map & weather, weather only uses overlay (transparent), base is filled
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, px, py, 256, 256);
        ctx.globalAlpha = 1;
        resolve();
      };
      img.onerror = resolve; // gracefully continue even if missing
      img.src = url;
    });
  }

  // Board click event
  function handleClick(idx) {
    if (board[idx] !== null || gameOver) return;
    const boardCopy = [...board];
    boardCopy[idx] = xIsNext ? "X" : "O";
    setBoard(boardCopy);
    setXisNext((x) => !x);
  }

  // PUBLIC_INTERFACE
  function handleReset() {
    setBoard(Array(9).fill(null));
    setXisNext(true);
    setGameOver(false);
    setStatus("Turn: X");
  }

  // Render responsive Tic Tac Toe grid, status, and controls
  return (
    <div className="App" style={{ minHeight: "100vh", minWidth: "100vw", overflow: "hidden" }}>
      {/* Animated Weather Map Background */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          zIndex: 0,
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          opacity: theme === "dark" ? 0.8 : 1,
          transition: "opacity 0.6s"
        }}
        id="weather-map-background"
        aria-hidden="true"
      ></canvas>
      {/* Light/ Dark Toggle */}
      <header className="App-header" style={{
        background: "rgba(22,33,62,0.55)",
        zIndex: 2,
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center"
      }}>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          style={{
            zIndex: 10
          }}
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>

        {/* Minimalistic title */}
        <span className="title" style={{
          fontSize: "2rem",
          letterSpacing: "0.05em",
          color: "var(--text-secondary)",
          fontWeight: 700,
          marginBottom: "12px",
          textShadow: "0 2px 8px rgba(17, 22, 33, 0.2)"
        }}>
          Tic Tac Toe
        </span>

        {/* Location Input Form */}
        <form onSubmit={handleLocationSubmit} style={{
          marginBottom: "20px",
          display: "flex",
          gap: "10px",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            placeholder="Enter city name..."
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              fontSize: "1rem",
              width: "200px"
            }}
          />
          <button
            type="submit"
            disabled={isLoadingLocation}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "var(--button-bg)",
              color: "#fff",
              fontSize: "1rem",
              cursor: isLoadingLocation ? "wait" : "pointer",
              opacity: isLoadingLocation ? 0.7 : 1
            }}
          >
            {isLoadingLocation ? "Loading..." : "Update Map"}
          </button>
        </form>

        <span className="subtitle" style={{
          fontSize: "1.1rem",
          color: "#c7ecff",
          fontWeight: 300,
          marginBottom: "7px"
        }}>
          {mapError
            ? mapError
            : coords
              ? `Weather map for ${locationInput || 'your area'}`
              : "Detecting location…"}
        </span>

        {/* Game Board */}
        <div
          className="game-container"
          style={{
            background: "rgba(255,255,255,0.05)",
            padding: "1.4rem",
            borderRadius: "20px",
            boxShadow:
              "0 4px 40px rgba(52, 152, 219, 0.09), 0 1.5px 2px rgba(0,0,0,0.01)",
            display: "inline-flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            margin: "16px 0",
            zIndex: 2,
          }}
        >
          {/* Status */}
          <div
            className="status"
            style={{
              marginBottom: "15px",
              fontSize: "1.34rem",
              color: "#fff",
              fontWeight: 500,
              textShadow: "0 1.8px 8px #0006"
            }}
          >
            {status}
          </div>
          {/* 3x3 Board */}
          <div
            className="board"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 60px)",
              gridTemplateRows: "repeat(3, 60px)",
              gap: "8px"
            }}
          >
            {board.map((cell, idx) => (
              <button
                key={idx}
                className="cell"
                aria-label={`Board cell ${idx+1}`}
                style={{
                  width: "60px",
                  height: "60px",
                  background: "rgba(255,255,255,0.14)",
                  border: "2px solid var(--border-color)",
                  borderRadius: "23%",
                  fontSize: "2.24rem",
                  fontWeight: 600,
                  color: cell === "X"
                    ? "var(--text-secondary)"
                    : cell === "O"
                    ? "#ffbb55"
                    : "rgba(255,255,255,0.38)",
                  transition: "background 0.18s",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
                  cursor: cell || gameOver ? "not-allowed" : "pointer",
                  textAlign: "center",
                  userSelect: "none"
                }}
                disabled={!!cell || gameOver}
                onClick={() => handleClick(idx)}
              >
                {cell}
              </button>
            ))}
          </div>
          {/* Reset Button */}
          <button
            className="btn btn-large"
            style={{
              marginTop: "20px",
              padding: "10px 26px",
              borderRadius: "10px",
              background: "var(--button-bg)",
              color: "var(--button-text)",
              border: "none",
              boxShadow: "0 2px 14px rgba(39, 66, 238, 0.18)",
              fontWeight: "bold",
              fontSize: "1.1rem",
              cursor: "pointer"
            }}
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
        <div
          style={{
            fontSize: "0.95rem",
            color: "#fff9",
            marginTop: "10px",
            fontWeight: 300,
            letterSpacing: "0.03em",
            textShadow: "0 1px 6px #001c"
          }}
        >
          Powered by OpenWeatherMap &middot; KAVIA
        </div>
      </header>
      {/* Responsive/mobile tweaks */}
      <style>{`
        @media (max-width: 599px) {
          .game-container {
            padding: 6px !important;
          }
          .board {
            grid-template-columns: repeat(3, 44px) !important;
            grid-template-rows: repeat(3, 44px) !important;
            gap: 5px !important;
          }
          .cell {
            width: 44px !important;
            height: 44px !important;
            font-size: 1.4rem !important;
            border-radius: 18% !important;
          }
        }
      `}</style>
    </div>
  );
}

// PUBLIC_INTERFACE
// Winner calculation for board of 9 elements
function calculateWinner(squares) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6] // diagonals
  ];
  for (let [a, b, c] of lines) {
    if (
      squares[a] &&
      squares[a] === squares[b] &&
      squares[a] === squares[c]
    ) {
      return squares[a];
    }
  }
  return null;
}

export default App;
