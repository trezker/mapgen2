function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function interpolatePoint(a, b, frac) {
    var nx = a.x+(b.x-a.x)*frac;
    var ny = a.y+(b.y-a.y)*frac;
    return {x:nx,  y:ny};
}

var Map = function(settings) {
	var self = this;
	self.settings = settings;
	self.random = new Srand(self.settings.seed);
	self.points = [];
	self.centers = [];
	self.corners = [];
	self.edges = [];

	self.PlacePoints = function() {
		for(i = 0; i < settings.numberOfPoints; i++) {
			self.points.push({
				x: self.random.randomIntegerIn(0, settings.width),
				y: self.random.randomIntegerIn(0, settings.height)
			});
		}
		
		for (i = 0; i < self.settings.numberOfLloydRelaxations; i++) {
			var bbox = {xl: 0, xr: self.settings.width, yt: 0, yb: self.settings.height};
			var voronoi = new Voronoi();
			var result = voronoi.compute(self.points, bbox);
			self.points = [];
			for (var c in result.cells) {
				var cell = result.cells[c];
				var p = { x: 0, y: 0 };
				for(var e in cell.halfedges) {
					p.x += cell.halfedges[e].getStartpoint().x;
					p.y += cell.halfedges[e].getStartpoint().y;
				}
				p.x /= cell.halfedges.length;
				p.y /= cell.halfedges.length;
				self.points.push(p);
			}
		}
	};

	self.Generate = function() {
		self.islandShape = self.makePerlin(self.settings.seed);
		self.PlacePoints();
		self.BuildGraph();
		self.AssignElevations();
	};
	
	self.DrawPoints = function(canvas) {
		for(var p in self.points) {
			canvas.DrawPoint(self.points[p]);
		}
	};

	self.DrawEdges = function(canvas) {
		for(var e in self.edges) {
			var edge = self.edges[e];
			canvas.DrawLine({
				from: edge.v0.point,
				to: edge.v1.point
			});
		}
		canvas.FlushLines(); 
	};

	self.BuildGraph = function() {
		var bbox = {xl: 0, xr: self.settings.width, yt: 0, yb: self.settings.height};
		var voronoi = new Voronoi();
		var result = voronoi.compute(self.points, bbox);
		self.BuildGraphFromVoronoi(self.points, result);
		//improveCorners();
	};

	// Build graph data structure in 'edges', 'centers', 'corners',
	// based on information in the Voronoi results: point.neighbors
	// will be a list of neighboring points of the same type (corner
	// or center); point.edges will be a list of edges that include
	// that point. Each edge connects to four points: the Voronoi edge
	// edge.{v0,v1} and its dual Delaunay triangle edge edge.{d0,d1}.
	// For boundary polygons, the Delaunay edge will have one null
	// point, and the Voronoi edge may be null.
	self.BuildGraphFromVoronoi = function(points, voronoi) {
		var q;
		var other;
		var libedges = voronoi.edges;
		var centerLookup = {};

		// Build Center objects for each of the points, and a lookup map
		// to find those Center objects again as we build the graph
		for(var point in self.points) {
			var p = {
				index: self.centers.length,
				point: self.points[point],
				neighbors: [],
				borders: [],
				corners: [],
			};
			self.centers.push(p);
			centerLookup[self.points[point]] = p;
		}
      
		// Workaround for Voronoi lib bug: we need to call region()
		// before Edges or neighboringSites are available
		/*
		for each (p in centers) {
			voronoi.region(p.point);
		}*/
      
		// The Voronoi library generates multiple Point objects for
		// corners, and we need to canonicalize to one Corner object.
		// To make lookup fast, we keep an array of Points, bucketed by
		// x value, and then we only have to look at other Points in
		// nearby buckets. When we fail to find one, we'll create a new
		// Corner object.
		var _cornerMap = {};
		function makeCorner(point) {
			if (point == null)
				return null;
			for (var bucket = Math.floor(point.x)-1; bucket <= Math.floor(point.x)+1; bucket++) {
				for(var q in _cornerMap[bucket]) {
					var dx = point.x - q.x;
					var dy = point.y - q.y;
					if (dx*dx + dy*dy < 1e-6) {
						return q;
					}
				}
			}
			var bucket = Math.floor(point.x);
			if (!_cornerMap[bucket]) {
				_cornerMap[bucket] = [];
			}
			var q = {
				index: self.corners.length,
				point: point,
				border: (point.x == 0 || point.x == self.settings.width
					  || point.y == 0 || point.y == self.settings.height),
				touches: [],
				protrudes: [],
				adjacent: []
			};
			self.corners.push(q);
			_cornerMap[bucket].push(q);
			return q;
		}

		// Helper functions for the following for loop; ideally these
		// would be inlined
		function addToCornerList(v, x) {
			if (x != null && v.indexOf(x) < 0) {
				v.push(x);
			}
		}
		function addToCenterList(v, x) {
			if (x != null && v.indexOf(x) < 0) {
				v.push(x);
			}
		}
          
		for(var libedge in libedges) {
			var ledge = libedges[libedge];
			//var dedge = libedges[libedge].delaunayLine();
			//var vedge = libedges[libedge].voronoiEdge();

			// Fill the graph data. Make an Edge object corresponding to
			// the edge from the voronoi library.
			var edge = {
				index: self.edges.length,
				river: 0,
				midpoint: ledge.va && ledge.vb && interpolatePoint(ledge.va, ledge.vb, 0.5),

				// Edges point to corners. Edges point to centers. 
				v0: makeCorner(ledge.va),
				v1: makeCorner(ledge.vb),
				d0: centerLookup[ledge.lSite],
				d1: centerLookup[ledge.rSite]
			};
			self.edges.push(edge);

			// Centers point to edges. Corners point to edges.
			if (edge.d0 != null) { edge.d0.borders.push(edge); }
			if (edge.d1 != null) { edge.d1.borders.push(edge); }
			if (edge.v0 != null) { edge.v0.protrudes.push(edge); }
			if (edge.v1 != null) { edge.v1.protrudes.push(edge); }

			// Centers point to centers.
			if (edge.d0 != null && edge.d1 != null) {
				addToCenterList(edge.d0.neighbors, edge.d1);
				addToCenterList(edge.d1.neighbors, edge.d0);
			}

			// Corners point to corners
			if (edge.v0 != null && edge.v1 != null) {
				addToCornerList(edge.v0.adjacent, edge.v1);
				addToCornerList(edge.v1.adjacent, edge.v0);
			}

			// Centers point to corners
			if (edge.d0 != null) {
				addToCornerList(edge.d0.corners, edge.v0);
				addToCornerList(edge.d0.corners, edge.v1);
			}
			if (edge.d1 != null) {
				addToCornerList(edge.d1.corners, edge.v0);
				addToCornerList(edge.d1.corners, edge.v1);
			}

			// Corners point to centers
			if (edge.v0 != null) {
				addToCenterList(edge.v0.touches, edge.d0);
				addToCenterList(edge.v0.touches, edge.d1);
			}
			if (edge.v1 != null) {
				addToCenterList(edge.v1.touches, edge.d0);
				addToCenterList(edge.v1.touches, edge.d1);
			}
		}
	};

	self.AssignElevations = function() {
		// Determine the elevations and water at Voronoi corners.
		self.assignCornerElevations();
/*
		// Determine polygon and corner type: ocean, coast, land.
		assignOceanCoastAndLand();

		// Rescale elevations so that the highest is 1.0, and they're
		// distributed well. We want lower elevations to be more common
		// than higher elevations, in proportions approximately matching
		// concentric rings. That is, the lowest elevation is the
		// largest ring around the island, and therefore should more
		// land area than the highest elevation, which is the very
		// center of a perfectly circular island.
		redistributeElevations(landCorners(corners));

		// Assign elevations to non-land corners
		for each (var q:Corner in corners) {
			if (q.ocean || q.coast) {
				q.elevation = 0.0;
			}
		}

		// Polygon elevations are the average of their corners
		assignPolygonElevations();*/
	};

    // Determine elevations and water at Voronoi corners. By
    // construction, we have no local minima. This is important for
    // the downslope vectors later, which are used in the river
    // construction algorithm. Also by construction, inlets/bays
    // push low elevation areas inland, which means many rivers end
    // up flowing out through them. Also by construction, lakes
    // often end up on river paths because they don't raise the
    // elevation as much as other terrain does.
    self.assignCornerElevations = function() {
		var queue = [];

		for(var q in self.corners) {
			self.corners[q].water = !self.inside(self.corners[q].point);
		}

		for(var q in self.corners) {
			// The edges of the map are elevation 0
			if (self.corners[q].border) {
				self.corners[q].elevation = 0.0;
				queue.push(self.corners[q]);
			} else {
				self.corners[q].elevation = Infinity;
			}
		}
		// Traverse the graph and assign elevations to each point. As we
		// move away from the map border, increase the elevations. This
		// guarantees that rivers always have a way down to the coast by
		// going downhill (no local minima).
		while (queue.length > 0) {
			var q = queue.shift();

			for(var s in q.adjacent) {
				// Every step up is epsilon over water or 1 over land. The
				// number doesn't matter because we'll rescale the
				// elevations later.
				var newElevation = 0.01 + q.elevation;
				if (!q.water && !q.adjacent[s].water) {
					newElevation += 1;
					if (needsMoreRandomness) {
						// HACK: the map looks nice because of randomness of
						// points, randomness of rivers, and randomness of
						// edges. Without random point selection, I needed to
						// inject some more randomness to make maps look
						// nicer. I'm doing it here, with elevations, but I
						// think there must be a better way. This hack is only
						// used with square/hexagon grids.
						newElevation += mapRandom.nextDouble();
					}
				}
				// If this point changed, we'll add it to the queue so
				// that we can process its neighbors too.
				if (newElevation < q.adjacent[s].elevation) {
					q.adjacent[s].elevation = newElevation;
					queue.push(q.adjacent[s]);
				}
			}
		}
	};

	// Determine whether a given point should be on the island or in the water.
	self.inside = function(p) {
		return self.islandShape({ 
			x: 2*(p.x/self.settings.width - 0.5), 
			y: 2*(p.y/self.settings.height - 0.5)
		});
	};
	
	// The Perlin-based island combines perlin noise with the radius
	self.makePerlin = function(seed) {
		/*
		var perlin = new BitmapData(256, 256);
		perlin.perlinNoise(64, 64, 8, seed, false, true);
		*/
		return function (q) {
			var scale = 1;  // pick a scaling value
			var c = PerlinNoise.noise(scale*q.x, scale*q.y, .8);
			q.length = Math.sqrt(q.x*q.x+q.y*q.y);
			return c > (0.3+0.3*q.length*q.length);
		};
	};

	// Determine polygon and corner types: ocean, coast, land.
	self.assignOceanCoastAndLand = function() {
		// Compute polygon attributes 'ocean' and 'water' based on the
		// corner attributes. Count the water corners per
		// polygon. Oceans are all polygons connected to the edge of the
		// map. In the first pass, mark the edges of the map as ocean;
		// in the second pass, mark any water-containing polygon
		// connected an ocean as ocean.
		var queue = [];

		for(var i in self.centers) {
			var p = self.centers[i];
			var numWater = 0;
			for(var j in p.corners) {
				var q = p.corners[j];
				if (q.border) {
					p.border = true;
					p.ocean = true;
					q.water = true;
					queue.push(p);
				}
				if (q.water) {
					numWater += 1;
				}
			}
			p.water = (p.ocean || numWater >= p.corners.length * LAKE_THRESHOLD);
		}
		while (queue.length > 0) {
			var p = queue.shift();
			for(var i in p.neighbors) {
				var r = p.neighbors[i];
				if (r.water && !r.ocean) {
					r.ocean = true;
					queue.push(r);
				}
			}
		}

		// Set the polygon attribute 'coast' based on its neighbors. If
		// it has at least one ocean and at least one land neighbor,
		// then this is a coastal polygon.
		for(var i in self.centers) {
			var p = self.centers[i];
			var numOcean = 0;
			var numLand = 0;
			for(var j in p.neighbors) {
				var r = p.neighbors[j];
				numOcean += Math.floor(r.ocean);
				numLand += Math.floor(!r.water);
			}
			p.coast = (numOcean > 0) && (numLand > 0);
		}

		// Set the corner attributes based on the computed polygon
		// attributes. If all polygons connected to this corner are
		// ocean, then it's ocean; if all are land, then it's land;
		// otherwise it's coast.
		for(var i in self.corners) {
			var q = self.corners[i];
			var numOcean = 0;
			var numLand = 0;
			for(var j in q.touches) {
				var p = q.touches[j];
				numOcean += Math.floor(p.ocean);
				numLand += Math.floor(!p.water);
			}
			q.ocean = (numOcean == q.touches.length);
			q.coast = (numOcean > 0) && (numLand > 0);
			q.water = q.border || ((numLand != q.touches.length) && !q.coast);
		}
	};
};



var map = new Map({
	width: 640,
	height: 480,
	numberOfPoints: 1000,
	seed: 1,
	numberOfLloydRelaxations: 2
});

map.Generate();

var canvas = new Canvas("canvas");
canvas.Resize(map.settings.width, map.settings.height);

map.DrawPoints(canvas);
map.DrawEdges(canvas);
