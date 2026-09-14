import { createRouter, createWebHistory } from 'vue-router';
import VotePage from './pages/VotePage.vue';
import IntroPage from './pages/IntroPage.vue';
import DetailPage from './pages/DetailPage.vue';
import RankingPage from './pages/RankingPage.vue';
import AdminLogin from './pages/AdminLogin.vue';
import AdminDashboard from './pages/AdminDashboard.vue';
import MyPage from './pages/MyPage.vue';
import { waitForListReady } from './listNavigation';
const scrollPositions = new Map<string,{left:number;top:number}>();

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/vote' },
    { path: '/vote', component: VotePage },
    { path: '/intro', component: IntroPage },
    { path: '/rank', component: RankingPage },
    { path: '/me', component: MyPage },
    { path: '/work/:id', component: DetailPage },
    { path: '/admin/login', component: AdminLogin },
    { path: '/admin', component: AdminDashboard }
  ],
  async scrollBehavior(to, _from, savedPosition) {
    if(['/vote','/rank'].includes(to.path)) await waitForListReady(to.path);
    if(savedPosition) return savedPosition;
    if(to.hash && document.getElementById(to.hash.slice(1))) return {el:to.hash,top:16};
    return ['/vote','/rank'].includes(to.path) ? scrollPositions.get(to.fullPath) || {top:0} : {top:0};
  }
});
router.beforeEach((_to,from)=>{
  if(['/vote','/rank'].includes(from.path)) scrollPositions.set(from.fullPath,{left:window.scrollX,top:window.scrollY});
});
