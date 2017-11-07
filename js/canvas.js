var Canvas = function(elementId) {
	var self = this;
	self.canvas = document.getElementById("canvas");
	self.canvasContext = self.canvas.getContext("2d");

	self.Resize = function(width, height) {
		$(self.canvas).attr("width", width);
		$(self.canvas).attr("height", height);
	};

	self.DrawLine = function(line) {
		self.canvasContext.moveTo(line.from.x, line.from.y);
		self.canvasContext.lineTo(line.to.x, line.to.y);
	};

	self.FlushLines = function() {
		self.canvasContext.stroke(); 		
	};

	self.DrawPoint = function(point) {
		self.canvasContext.fillRect(point.x, point.y, 1, 1);
	};

	self.DrawPolygon = function(polygon) {
		self.canvasContext.fillStyle = polygon.color;
		self.canvasContext.beginPath();
		self.canvasContext.moveTo(polygon.corners[0].x, polygon.corners[0].y);
		for(var i = 1; i < polygon.corners.length; i++) {
			self.canvasContext.lineTo(polygon.corners[i].x, polygon.corners[i].y);
		}
		self.canvasContext.closePath();
		self.canvasContext.fill();
	};
};
