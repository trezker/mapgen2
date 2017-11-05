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
		self.canvasContext.stroke(); 
	};
};
