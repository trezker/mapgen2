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
	self.random = new Srand(settings.seed);
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
	};

	self.Generate = function() {
		self.PlacePoints();
		self.BuildGraph();
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
		result = voronoi.compute(self.points, bbox);
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
};



var map = new Map({
	width: 640,
	height: 480,
	numberOfPoints: 1000,
	seed: 1
});

map.Generate();

var canvas = new Canvas("canvas");
canvas.Resize(map.settings.width, map.settings.height);

map.DrawPoints(canvas);
map.DrawEdges(canvas);
