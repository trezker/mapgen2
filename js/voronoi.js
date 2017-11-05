function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

var VoronoiMap = function(settings) {
	var self = this;
	self.settings = settings;
	self.points = [];

	self.PlacePoints = function() {
		for(i = 0; i < settings.numberOfPoints; i++) {
			self.points.push({
				x: getRandomInt(0, settings.width),
				y: getRandomInt(0, settings.height)
			});
		}
	};

	self.Generate = function() {
		self.PlacePoints();
	};
	
	self.DrawPoints = function(canvas) {
		for(var p in self.points) {
			canvas.DrawPoint(self.points[p]);
		}
	}
};



var map = new VoronoiMap({
	width: 640,
	height: 480,
	numberOfPoints: 1000
});

map.Generate();

var canvas = new Canvas("canvas");
canvas.Resize(map.settings.width, map.settings.height);

map.DrawPoints(canvas);