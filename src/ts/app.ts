
//optional import tests only, these are not crucial to build steps

// import * as THREE from 'three';
import gsap, { SteppedEase} from 'gsap'
import Draggable from 'gsap/Draggable';
import EasePack from 'gsap/EasePack';
import { Power4 } from 'gsap/gsap-core';
import Observer from 'gsap/Observer';
import Timeline from 'gsap/all';
import  Tween  from 'gsap/src/all';
import './module.ts';
//gsap registration, global scope
gsap.registerPlugin(EasePack);
gsap.registerPlugin(Tween);
gsap.registerPlugin(SteppedEase);
gsap.registerPlugin(Timeline);
gsap.registerPlugin(Power4);
gsap.registerPlugin(Observer);

// import styles from './style.scss'
console.log("app ts loaded");
var window: Window & typeof globalThis
// console.log(styles);
let isLoaded = false;
let isLoadingAnimationEnd = false;
const tl = gsap.timeline({
    defaults: {
      ease: "power4.inOut",
    //   opacity:0,
    }
  });
const loadingAnimation = () => {
    tl.to('.outer__wrapper', {
   
      y: 50, 
    //   autoAlpha: 0, //animate opacity from zero to one, and set visibility to inherit
    //   ease: "power4.in",
    //   opacity: 1,
      stagger: 0,
      duration: 1,
    //   onInterrupt: () => {
    //   //set an interrupt protocol, if this animation fails to fire then nothing will be visible, it should rarely if ever have to be accessed
    //   tl.restart();
    //   },
    //   onComplete: () => { }
    })
}
    // window.onload = (event) => {
    //     // console.log("page is fully loaded");

        loadingAnimation();
        console.log("loading animation successful");
//       };
// }