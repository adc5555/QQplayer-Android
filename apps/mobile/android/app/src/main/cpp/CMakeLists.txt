cmake_minimum_required(VERSION 3.22.1)
project(qqplayer_node)

add_library(qqplayer_node SHARED node_runtime.cpp)

target_compile_features(qqplayer_node PRIVATE cxx_std_20)

set(NODE_HOME "$ENV{QQPLAYER_NODE_HOME}" CACHE PATH "Node.js headers and libnode.so directory")

if(NOT EXISTS "${NODE_HOME}/include/node/node.h")
    message(FATAL_ERROR "QQPLAYER_NODE_HOME must point to Node.js include/lib directory")
endif()

target_include_directories(qqplayer_node PRIVATE "${NODE_HOME}/include/node")
target_link_libraries(qqplayer_node PRIVATE
    "${NODE_HOME}/lib/arm64-v8a/libnode.so"
    log
)
