(() => {

'use strict';

phina.globalize();

const Screen = {
    width: 960,
    height: 640,
};
const World = {
    width: Screen.width*5,
    height: Screen.height*5,
};

phina.define('Camera', {
    superClass: 'CanvasLayer',
    init: function (option) {
        this.superInit(option);
        this.context = this.canvas.context;
        this.target = option.target || null;
        this.magnification = option.magnification || 1;
        this.alpha = option.alpha || 1;
        this.range = option.range || {x:0,y:0,w:this.width,h:this.height};
        this.backgroundColor = '#222';
        this.rangeBorder = RectangleShape({fill: 'transparent',height:this.height,width:this.width});
        this.offset = Vector2(0, 0);
        this.drawPoint = Vector2(0, 0);
        this.on('enterframe', function (e) {
            var temp = this._worldMatrix;
            this._worldMatrix = null;
            this.renderer.render(this);
            this._worldMatrix = temp;
        });
    },
    follow: function (target) {
        this.target = target;
        return this;
    },
    setRange: function (x, y, w, h) {
        this.range = {
            dx: x,
            dy: y,
            dw: w,
            dh: h,
        };
        return this;
    },
    calcViewRange: function (target) {
        if (!this.target) return;
        var target = this.target;
        var dstCanvas = this.target.parent;
        var mwidth = this.width * this.magnification;
        var mheight = this.height * this.magnification;
        var dx = Math.floor(target.x - mwidth * 0.5);
        var dy = Math.floor(target.y - mheight * 0.5);
        var dw = Math.floor(target.x + mwidth * 0.5);
        var dh = Math.floor(target.y + mheight * 0.5);

        dx += this.offset.x;
        dy += this.offset.y;

        if (dx < 0) {
            dx = 0;
            dw = mwidth;
        }
        if (dx > dstCanvas.width - mwidth) {
            dx = Math.floor(dstCanvas.width - mwidth);
            dw = dstCanvas.width;
        }
        if (dy < 0) {
            dy = 0;
            dh = mheight;
        }
        if (dy > dstCanvas.height - mheight) {
            dy = Math.floor(dstCanvas.height - mheight);
            dh = dstCanvas.height;
        }

        return {dx:dx,dy:dy,dw:dw,dh:dh};
    },
    showRangeBorder: function (destination) {
        this.rangeBorderDst = destination.addChild(this.rangeBorder);
        return this;
    },
    hideRangeBorder: function () {
        this.rangeBorderDst.removeChild(this.rangeBorder);
        return this;
    },
    isDrawing: function (element) {
        let left = this.drawPoint.x;
        let right = this.drawPoint.x + this.width;
        let top = this.drawPoint.y;
        let bottom = this.drawPoint.y + this.height;

        return (left < element.right && right > element.left &&
            top < element.bottom && bottom > element.top);
    },
    draw: function (canvas) {
        if (this.target) this.range = this.calcViewRange(this.target);
        var range = this.range;
        var dstCanvas = this.target.parent.canvas || canvas;
        var image = dstCanvas.domElement;
        // キャンバスの描画は基準点(origin)からsw,shの分だけ行われる。
        // そのため、基準点が300,300で、描画したい範囲が0,0から300,300なら
        // 式は-300,-300, 300, 300となる。
        this.canvas.drawImage(
            image, range.dx, range.dy, this.width, this.height,
            0, 0, this.width, this.height);
        this.drawPoint.set(range.dx, range.dy);
        
        // 親キャンバスに書き写す
        canvas.context.drawImage(
            this.domElement, 0, 0, this.width, this.height,
            -this.width*this.originX, -this.height*this.originY, this.width, this.height);

        // TODO:描画範囲のオブジェクトを集める
        this.rendered = [];
        let children = this.parent.layer.children;
        this.rendered = children.filter((it) => {this.isDrawing(it) });

        this.rangeBorder.left = range.dx;
        this.rangeBorder.top = range.dy;
    }
});

phina.define('Physics', {
    superClass: 'Physical',
    init: function (target) {
        this.superInit(target);
        this.super = {update: Physical.prototype.update};
        target.velocity = this.velocity;
        target.gravity = this.gravity;
        target.friction = this.friction;
        target.force = this.force;
        target.addForce = this.addForce;
        target.setGravity = this.setGravity;
        target.setFriction = this.setFriction;
        target.elestic = this.elestic = 0.5;
        target.drag = this.drag = 0.999;
        target.collidable = true;

        target.isKinematic = this.isKinematic = true;
    },
    update: function (app) {
        if (!this.isKinematic) return;
        this.super.update.call(this, app);
        this.velocity.mul(this.drag);
    },
});
phina.app.Element.prototype.getter('physics', function() {
    if (!this._physics) {
        this._physics = Physics(this).attachTo(this);
    }
    return this._physics;
});

phina.define('Collider', {
    superClass: 'Accessory',
    init: function (target) {
        this.superInit(target);

        this.collidables = [];

        this.on('attached', function () {
            let self = this;
            if (!this.target.parent) {
                this.target.on('added', function (e) {
                    self.flare('attached');
                });
                return;
            }
            this.collidables = this.target.parent.children;
        });
    },
    setCollidables: function (collidables) {
        if (typeof(collidables.each) !== 'function')
            throw new Error('not eachable object');
        
        this.collidables = collidables;
    },
    getCollidables: function () {
        return this.collidables;
    },
    withElement: function (element) {
        // 衝突対象の各辺
        const top = element.top;
        const bottom = element.bottom;
        const left = element.left;
        const right = element.right;

        const prepos = Vector2.sub(this.position, this.velocity);
        const nowpos = this.position.clone();
        
        // 座標位置を遡る回数
        const numOfJudge = 10;

        for (var i = 0; i < numOfJudge; i++) {
            // n回前の座標位置を求める
            var lerp = Vector2.lerp(prepos, nowpos, i/numOfJudge);
            // 中心点同士の距離を測り、xとy比較して差が大きい方向から衝突したとして処理する
            var dp = Vector2.sub(lerp, element);

            if (Math.abs(dp.x) < Math.abs(dp.y)) {
                // yの方が差が大きい=上もしくは下からきた
                if (dp.y >= 0) {
                    this.top = bottom;
                    var surface = Vector2(right-left, 0);
                    var reflect =
                        Vector2.reflect(this.velocity, Vector2(-surface.y, surface.x).normalize());
                    this.velocity.set(reflect.x, reflect.y);
                    this.velocity.mul(this.elestic);
                    return;
                } else {
                    this.bottom = top;
                    var surface = Vector2(left-right, 0);
                    var reflect =
                        Vector2.reflect(this.velocity, Vector2(-surface.y, surface.x).normalize());
                    this.velocity.set(reflect.x, reflect.y);
                    this.velocity.mul(this.elestic);
                    return;
                }
            } else {
                // xの方が差が大きい=左もしくは右からきた
                if (dp.x >= 0) {
                    this.left = right;
                    var surface = Vector2(0, top-bottom);
                    var reflect =
                        Vector2.reflect(this.velocity, Vector2(-surface.y, surface.x).normalize());
                    this.velocity.set(reflect.x, reflect.y);
                    this.velocity.mul(this.elestic);
                    return;
                } else {
                    this.right = left;
                    var surface = Vector2(0, bottom-top);
                    var reflect =
                        Vector2.reflect(this.velocity, Vector2(-surface.y, surface.x).normalize());
                    this.velocity.set(reflect.x, reflect.y);
                    this.velocity.mul(this.elestic);
                    return;
                }
            }
        }
    },
    withGround: function (ground) {
        this.bottom = ground.top;
        this.velocity.y *= -0.5;
    },
    update: function (app) {
        if (!this.collidables) return;
        var filtered = this.collidables.filter( (it) => it !== this.target && it.collidable );
        filtered.each(function (element) {
            if (element.hitTestElement(this.target)) {
                if (element.isGround) {
                    this.withGround.call(this.target, element);
                } else {
                    this.withElement.call(this.target, element);
                }
            }
        }, this);
    }
});

phina.define('Player', {
    superClass: 'RectangleShape',
    init: function (option) {
        option = option || {};
        this.superInit(option);
        this.collider = Collider(this).attachTo(this);
        this.draggable.enable();
        this.on('dragstart', () => {
            this.physics.isKinematic = false;
        });
        this.on('dragend', () => {
            this.physics.isKinematic = true
        });
    },
    update: function (app) {
    }
});

phina.define ('Ball', {
    superClass: 'CircleShape',
    init: function (option) {
        option = option || {};
        this.superInit(option);
        var g = option.gravity || Vector2(0, 0.1);
        option.physics && this.physics.gravity.set(g.x, g.y);
        this.elestic = 0.6;

        this.on('pointstart', function (e) {
            this.startPosition = e.pointer.position.clone();
        });
        this.on('pointmove', function (e) {
            //var v = Vector2.sub(ball.startPosition, e.pointer.position);
        });
        this.on('pointend', function (e) {
            this.endPosition = e.pointer.position.clone();
            var v = Vector2.sub(this.startPosition, this.endPosition).mul(0.2);
            this.addForce(v.x, v.y);
        });

        this.collider = Collider(this).attachTo(this);

        this.shape = RectangleShape({
            width: this.width,
            height: this.height,
        }).addChildTo(this).alpha = 0.3;
    },
    bound: function (app) {
        var left = this.parent.left //+ this.parent.width*this.originX;
        var right = this.parent.right //+ this.parent.width*this.originX;
        var top = this.parent.top //+ this.parent.height*this.originY;
        var bottom = this.parent.bottom //+ this.parent.height*this.originY;
        // Vector2.reflectってメソッドあるよね…
        var calcReflectVector = function (v, surface) {
            var normal = Vector2(-surface.y, surface.x).normalize();
            var a = -Vector2.dot(v, normal);
            var r = Vector2.add(v, Vector2.mul(normal, 2*a));
            return r;
        }
        if (left > this.left) {
            this.left = left;
            var reflect = calcReflectVector(this.velocity, Vector2(0, bottom - top));
            this.velocity.set(reflect.x, reflect.y);
            this.velocity.mul(this.elestic);
        }
        if (right < this.right) {
            this.right = right;
            var reflect = calcReflectVector(this.velocity, Vector2(0, bottom - top));
            this.velocity.set(reflect.x, reflect.y);
            this.velocity.mul(this.elestic);
        }
        if (top > this.top) {
            this.top = top;
            var reflect = calcReflectVector(this.velocity, Vector2(right - left, 0));
            this.velocity.set(reflect.x, reflect.y);
            this.velocity.mul(this.elestic);
        }
        if (bottom < this.bottom) {
            this.bottom = bottom;
            var reflect = calcReflectVector(this.velocity, Vector2(left - right, 0));
            this.velocity.set(reflect.x, reflect.y);
            this.velocity.y *= this.elestic;
        }
    },
    crossTest: function (ax, ay, bx, by, cx, cy, dx, dy) {
        // 線分交差判定
        // http://qiita.com/ykob/items/ab7f30c43a0ed52d16f2
        var tc = Math.floor((ax-bx)*(cy-ay)+(ay-by)*(ax-cx));
        var td = Math.floor((ax-bx)*(dy-ay)+(ay-by)*(ax-dx));
        return (tc*td < 0);
    },
    update: function (app) {
        this.bound();
    },
});

phina.define('MainScene', {
    superClass: 'DisplayScene',
    init: function (option) {
        this.superInit(option);

        var layer = this.layer = CanvasLayer({
            x: this.gridX.center(),
            y: this.gridY.center(),
            width: World.width,
            height: World.height,
            backgroundColor: this.backgroundColor,
        }).addChildTo(this);
        layer.backgroundColor = this.backgroundColor;
        //layer.hide();

        var ball = layer.ball = Ball({
            stroke: '#444',
            fill: '#eee',
            radius: 10,
            v: Vector2(0, 0),
            physics: true,
            gravity: Vector2(0, 0.98),
        }).addChildTo(layer);
        ball.x = layer.gridX.center();
        ball.y = layer.gridY.center();

        var ground = layer.ground = RectangleShape({
            fill: '#533',
            width: layer.width,
            height: 200,
        }).addChildTo(layer);
        ground.collidable = true;
        ground.isGround = true;
        ground.top = layer.height*0.95 + 10;
        ground.left = 0;

        (1).times(function () {
            var rect = RectangleShape({
                fill: 'hsla({0}, 75%, 50%, 1)'.format(Math.randint(0, 360)),
                width: Math.randint(30, 100),
                height: Math.randint(30, 100),
            }).addChildTo(this);
            rect.position.set(Math.randint(0, this.width), Math.randint(0, this.height));
            rect.collidable = true;
        }, layer);

        var player = this.player = Player().addChildTo(layer);
        player.physics.gravity.set(0, 1);
        player.x = layer.gridX.center();
        player.y = layer.gridY.center();
        //player.attach(Collider());

        var camera = this.camera = Camera({
            x: this.gridX.center(),
            y: this.gridY.center(),
            width: this.width,
            height: this.height,
            magnification: 1,
        }).addChildTo(this);
        camera.follow(player);
        
        this.on('pointstart', function (e) {
            ball.flare('pointstart', e);
        });
        this.on('pointmove', function (e) {
            ball.flare('pointmove', e);
        });
        this.on('pointend', function (e) {
            ball.flare('pointend', e);
        });
    },
    update: function (app) {
        // console.log('pointer.x={0},pointer.y={1}'.format(app.pointer.x, app.pointer.y));
        // console.log('player.x={0},player.y={1}'.format(this.player.x, this.player.y));
        //this.camera.setRange(app.pointer.x, app.pointer.y, 960, 480);
    }
});

phina.main(function () {
  var app = GameApp({
    title: 'SandBox',
    startLabel: 'title',
    width: Screen.width,
    height: Screen.height,
    backgroundColor: '#eee',
    fontColor: '#222',
  });
  app.fps = 60;
  app.enableStats();
  app.run();
});

})();
