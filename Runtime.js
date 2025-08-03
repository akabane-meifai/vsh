class Process{
	constructor(worker, ports){
		this.ports = ports;
		this.exitValue = null;
		this.environments = null;
		this.currentDirectory = null;
		this.worker = worker;
		this.resolvers = Promise.withResolvers();
		this.worker.addEventListener("message", e => {
			const data = e.data;
			this.exitValue = data.exitValue;
			this.currentDirectory = data.currentDirectory;
			this.environments = data.environments;
			if(this.exitValue == 0){
				this.resolvers.resolve(this);
			}else{
				this.resolvers.reject(this);
			}
		}, {once : true});
	}
	getInputStream(){
		return new ReadableStream({
			start(controller){
				this.controller = controller;
				this.port.addEventListener("message", this);
				this.port.start();
				this.promise.finally(() => {
					this.controller.close();
					this.port.removeEventListener("message", this);
					this.port.close();
				});
			},
			handleEvent(e){
				this.controller.enqueue(e.data);
			},
			controller: null,
			port: this.ports[1],
			promise: this.resolvers.promise
		});
	}
	getOutputStream(){
		return new WritableStream({
			start(controller){
			},
			write(chunk, controller){
				this.port.postMessage(chunk);
			},
			close(controller){
				this.port.postMessage(null);
				this.port.close();
			},
			abort(reason){
				this.port.postMessage(null);
				this.port.close();
			},
			port: this.ports[0]
		});
	}
	getErrorStream(){
		return new ReadableStream({
			start(controller){
				this.controller = controller;
				this.port.addEventListener("message", this);
				this.port.start();
				this.promise.finally(() => {
					this.controller.close();
					this.port.removeEventListener("message", this);
					this.port.close();
				});
			},
			handleEvent(e){
				this.controller.enqueue(e.data);
			},
			controller: null,
			port: this.ports[2],
			promise: this.resolvers.promise
		});
	}
	getExitValue(){
		return this.exitValue;
	}
	destroy(exitValue){
		if(this.exitValue == null){
			this.exitValue = exitValue;
			if(exitValue == 0){
				this.resolvers.resolve(this);
			}else{
				this.resolvers.reject(this);
			}
			this.worker.terminate();
		}
	}
	waitFor(){
		return this.resolvers.promise;
	}
}
class Runtime{
	static exec(command, environments, currentDirectory){
		const worker = new Worker("worker.js");
		const channels = Array.from({length: 3}, () => new MessageChannel());
		worker.postMessage({command, environments, currentDirectory}, channels.map(channel => channel.port2));
		return new Process(worker, channels.map(channel => channel.port1));
	}
}