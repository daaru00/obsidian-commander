## Example code block execution

Simple sh or bash code block:

```sh
echo "hello world!"
```
```bash
echo "test" | sed 's/te/mi/g'
```

Javascript code block:

```js
var foo = 'bar'
console.log(foo.toUpperCase())
```
```js
console.log('test')
```

A JavaScript long running command:
```js
console.log('running..')
await new Promise((resolve, reject) => setTimeout(resolve, 3000))
console.log('ok')
```
