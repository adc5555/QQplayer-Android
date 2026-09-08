#include <jni.h>
#include <string>
#include <vector>
#include <thread>
#include <cstring>
#include <android/log.h>
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
  std::vector<std::string> args = {
    "node",
    entry,
    std::string("--qqplayer-port=") + std::to_string(port),
    std::string("--qqplayer-token=") + token_chars,
    std::string("--qqplayer-data-dir=") + data_chars
  };

  size_t buffer_size = 0;
  for (const auto& arg : args) buffer_size += arg.size() + 1;
  char* args_buffer = new char[buffer_size]();
  std::vector<char*> argv;
  argv.reserve(args.size() + 1);
  size_t offset = 0;
  for (const auto& arg : args) {
    char* dest = args_buffer + offset;
    std::memcpy(dest, arg.c_str(), arg.size() + 1);
    argv.push_back(dest);
    offset += arg.size() + 1;
  }
  argv.push_back(nullptr);

  g_node_thread = std::thread([argv, args_buffer]() {
    __android_log_print(ANDROID_LOG_INFO, "QQPlayerNode", "starting node runtime");
    int exit_code = node::Start(static_cast<int>(argv.size() - 1), const_cast<char**>(argv.data()));
    __android_log_print(ANDROID_LOG_ERROR, "QQPlayerNode", "node runtime exited: %d", exit_code);
    delete[] args_buffer;
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
