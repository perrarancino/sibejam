// Steering in world space. Acceleration and angular speed are bounded independently.
export function steer(state, commandX, commandZ, speed, dt) {
  const length=Math.hypot(commandX,commandZ);
  let targetSpeed=0;
  if(length>0){
    const desired=Math.atan2(commandX,commandZ);
    const delta=Math.atan2(Math.sin(desired-state.yaw),Math.cos(desired-state.yaw));
    const turn=Math.max(-7*dt,Math.min(7*dt,delta));
    state.yaw+=turn;
    const remaining=delta-turn;
    targetSpeed=speed*Math.max(0,Math.cos(remaining));
  }
  const targetX=Math.sin(state.yaw)*targetSpeed,targetZ=Math.cos(state.yaw)*targetSpeed;
  const changeX=targetX-state.x,changeZ=targetZ-state.z,change=Math.hypot(changeX,changeZ);
  const acceleration=targetSpeed<Math.hypot(state.x,state.z)?16:10;
  const amount=change>0?Math.min(1,acceleration*dt/change):0;
  state.x+=changeX*amount;state.z+=changeZ*amount;
  return state;
}
