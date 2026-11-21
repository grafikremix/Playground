import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { specimens } from './src/experiments.js'

function versionPlugin() {
  const build = process.env.GITHUB_SHA || `dev-${Date.now()}`
  const base = process.env.GITHUB_ACTIONS ? '/Playground/' : '/'
  const snippet = `<script>
(function(){
  var key='playground-build';
  fetch(${JSON.stringify(`${base}version.json`)}+'?t='+Date.now(),{cache:'no-store'})
    .then(function(r){return r.ok?r.json():null})
    .then(function(v){
      if(!v||!v.build)return;
      var prev=sessionStorage.getItem(key);
      sessionStorage.setItem(key,v.build);
      if(prev&&prev!==v.build){
        var u=new URL(location.href);
        u.searchParams.set('_b',v.build);
        location.replace(u.href);
      }
    }).catch(function(){});
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistrations().then(function(rs){
      for(var i=0;i<rs.length;i++) rs[i].unregister();
    });
  }
})();
</script>`
  return {
    name: 'pg-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build }),
      })
    },
    transformIndexHtml(html) {
      if (html.includes('playground-build')) return html
      return html.replace('</head>', `${snippet}</head>`)
    },
  }
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Playground/' : '/',
  plugins: [versionPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(
          specimens.map((s) => [s.slug, resolve(__dirname, `specimens/${s.slug}.html`)]),
        ),
      },
    },
  },
})
