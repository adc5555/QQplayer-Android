#include <jni.h>
#include <string>
#include <thread>
#include <node.h>

namespace {
std::thread g_node_thread;
bool g_running = false;
}

extern "C"
JNIEXPORT jint JNICALL
Java_com_qqplayer_core_NodeRuntime_nativeStart(
    JNIEnv* env,
    jobject,
    jint port,
    jstring token,
    jstring data_dir) {
  if (g_running) return -1;
  const char* token_chars = env->GetStringUTFChars(token, nullptr);
  const char* data_chars = env->GetStringUTFChars(data_dir, nullptr);

  std::string entry = data_chars;
  entry += "/runner.js";
  std::string token_arg = std::string("--qqplayer-token=") + token_chars;
  std::string port_arg = std::string("--qqplayer-port=") + std::to_string(port);
  std::string data_arg = std::string("--qqplayer-data-dir=") + data_chars;

  g_node_thread = std::thread([entry, token_arg, port_arg, data_arg]() {
    const char* argv[] = {
      "node",
      entry.c_str(),
      port_arg.c_str(),
      token_arg.c_str(),
      data_arg.c_str()
    };
    int argc = 5;
    node::Start(argc, const_cast<char**>(argv));
  });
  g_running = true;

  env->ReleaseStringUTFChars(token, token_chars);
  env->ReleaseStringUTFChars(data_dir, data_chars);
  return 0;
}

extern "C"
JNIEXPORT jint JNICALL
Java_com_qqplayer_core_NodeRuntime_nativePause(JNIEnv*, jobject) {
  return 0;
}

extern "C"
JNIEXPORT jint JNICALL
Java_com_qqplayer_core_NodeRuntime_nativeResume(JNIEnv*, jobject) {
  return 0;
}

extern "C"
JNIEXPORT jint JNICALL
Java_com_qqplayer_core_NodeRuntime_nativeStop(JNIEnv*, jobject) {
  if (!g_running) return 0;
  // 实际嵌入方案会调用 uv_stop 并 join 线程；当前骨架保留接口。
  g_running = false;
  if (g_node_thread.joinable()) g_node_thread.detach();
  return 0;
}
