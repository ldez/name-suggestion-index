import { createContext, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Category } from './Category';
import { Header } from './Header';
import { Footer } from './Footer';
import { Overview } from './Overview';

// Load the name-suggestion-index data files
const DIST = 'https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/dist';
const INDEX = `${DIST}/nsi.min.json`;
const WIKIDATA = `${DIST}/wikidata.min.json`;

// We can use iD's taginfo file to pick icons
const TAGINFO = 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@latest/dist/taginfo.min.json';


export const AppContext = createContext(null);

export function AppContextProvider() {
  const [wikidata, wikidataLoading] = useFetch(WIKIDATA);
  const [index, indexLoading] = useNsi(INDEX);
  const [icons, iconsLoading] = useTaginfo(TAGINFO);
  const [params, setParams] = useState({});
  const [hash, setHash] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  // Lock in one navigation change so the useEffects don't back and forth between pages
  let _didChangeLocation = false;

  // Update params/hash when location changes
  // Do the update only if something has really changed (to avoid infinite looping)
  useEffect(() => {
    let newHash = location.hash;
    let newSearch = location.search;
    let newParams = stringQs(newSearch);

    // if passed an `id` param, lookup that item and override the `t`,`k`,`v` params
    let itemID = newParams.id;
    if (itemID) {
      if (indexLoading) return;   // wait for index to load, we'll come back to this.

      const item = index.id[itemID];
      if (item) {
        const parts = item.tkv.split('/', 3);     // tkv = 'tree/key/value'
        newParams.t = parts[0];
        newParams.k = parts[1];
        newParams.v = parts[2];

        // move it from the `id` param to the hash
        newHash = '#' + itemID;
        delete newParams.id;

        newSearch = qsString(newParams);
      }
    }

    // update hash from location.hash
    // update params from location.search
    const oldSearch = '?' + qsString(params);
    if (hash !== newHash || oldSearch !== newSearch) {
      _didChangeLocation = true;
      setHash(newHash);
      setParams(stringQs(newSearch));
    }

  }, [location, indexLoading]);


  // Update location when params/hash changes
  // Do the update only if something has really changed (to avoid infinite looping)
  useEffect(() => {
    if (indexLoading) return;  // come back to it later

    // Put params in this order
    const newParams = {};
    ['t', 'k', 'v', 'id', 'tt', 'cc', 'inc'].forEach(k => {
      if (params[k]) {
        newParams[k] = params[k];
      } else if (k === 't') {       // if no tree specified,
        newParams[k] = 'brands';    // default to the 'brands' tree
      }
    });

    const newSearch = '?' + qsString(newParams);
    const newHash = hash;

    // Update url ONLY if something has changed (to avoid infinite looping)
    if (!_didChangeLocation && newSearch !== location.search || newHash !== location.hash) {
      const to = location.pathname + newSearch + newHash;
      navigate(to, { replace: true });
      _didChangeLocation = false;
    }
  }, [params, hash, indexLoading]);


  const appState = {
    index: index,
    icons: icons,
    wikidata: wikidata.wikidata,
    isLoading: () => (indexLoading || iconsLoading || wikidataLoading),
    params: params,
    setParams: setParams,
    hash: hash,
    setHash: setHash
  };

  return (
    <AppContext.Provider value={appState}>
      <Header/>
      <div id='content'>
        { (params.k && params.v) ? <Category/> : <Overview/> }
      </div>
      <Footer/>
    </AppContext.Provider>
  );
}



// Fetch some data
function useFetch(url) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchUrl() {
    const response = await fetch(url);
    const json = await response.json();
    setData(json);
    setLoading(false);
  }

  useEffect(() => { fetchUrl(); }, []);
  return [data, loading];
}


// same as useFetch, but load name-suggestion-index data into a cache
function useNsi(url) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  async function fetchUrl() {
    const response = await fetch(url);
    const json = await response.json();
    let index = { path: {}, id: {}, meta: json._meta };

    // populate cache
    for (const [tkv, category] of Object.entries(json.nsi)) {
      const items = category.items;
      if (!Array.isArray(items)) continue;  // empty category, skip

      index.path[tkv] = items;
      for (const item of items) {
        item.tkv = tkv;  // remember the path for later
        index.id[item.id] = item;
      }
    }

    setData(index);
    setLoading(false);
  }

  useEffect(() => { fetchUrl(); }, []);
  return [data, loading];
}


// same as useFetch, but process taginfo file to retrieve icon urls
function useTaginfo(url) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  async function fetchUrl() {
    const response = await fetch(url);
    const json = await response.json();
    const tags = json.tags;
    let icons = {};

    // populate icons
    for (const tag of tags) {
      if (!tag.icon_url || !tag.key) continue;

      let kv = tag.key;
      if (tag.value) {
        kv += '/' + tag.value;
      }
      icons[kv] = tag.icon_url;
    }

    setData(icons);
    setLoading(false);
  }

  useEffect(() => { fetchUrl(); }, []);
  return [data, loading];
}


// convert a query string to an object of `k=v` pairs
function stringQs(str) {
  let i = 0;  // advance past any leading '?' or '#' characters
  while (i < str.length && (str[i] === '?' || str[i] === '#')) i++;
  str = str.slice(i);

  return str.split('&').reduce((obj, pair) => {
    const parts = pair.split('=');
    if (parts.length === 2) {
      obj[parts[0]] = (null === parts[1]) ? '' : decodeURIComponent(parts[1]);
    }
    return obj;
  }, {});
}


// convert an object of `k=v` pairs to a querystring
function qsString(obj) {
  return Object.keys(obj).map(key => {
    return encodeURIComponent(key) + '=' + (encodeURIComponent(obj[key]));
  }).join('&');
}