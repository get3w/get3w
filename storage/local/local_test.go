package local

import (
	"log"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
)

var service = NewService("")

func TestNewService(t *testing.T) {
	assert.Empty(t, NewService("not exists").directoryPath)
	assert.NotEmpty(t, NewService("").directoryPath)
}

func TestGetFiles(t *testing.T) {
	files, err := service.GetFiles("/")
	for _, file := range files {
		log.Println(file)
	}
	assert.Nil(t, err)
	assert.True(t, len(files) > 0)
}

func TestGetAllFiles(t *testing.T) {
	files, err := service.GetAllFiles()
	for _, file := range files {
		log.Println(file)
	}
	assert.Nil(t, err)
	assert.True(t, len(files) > 0)
}

func TestWrite(t *testing.T) {
	err := service.Write("/_test/index.html", "hello world")
	assert.Nil(t, err)
}

func TestWriteBinary(t *testing.T) {
	bs := []byte("hello world")
	err := service.WriteBinary("/_test/1.html", bs)
	assert.Nil(t, err)
	err = service.WriteBinary("/_test/2.html", bs)
	assert.Nil(t, err)
}

func TestCopy(t *testing.T) {
	err := service.Copy("/_test/1.html", "/_test/3.html")
	assert.Nil(t, err)
}

func TestRead(t *testing.T) {
	content, err := service.Read("/_test/index.html")
	log.Println(content)
	assert.Nil(t, err)
}

func TestUpload(t *testing.T) {
	path, _ := filepath.Abs("local_test.go")
	err := service.Upload("/_test/local_test.go", path)
	assert.Nil(t, err)
}

func TestDownload(t *testing.T) {
	err := service.Download("/_test/baidu.html", "http://www.baidu.com")
	assert.Nil(t, err)
}

func TestIsExist(t *testing.T) {
	assert.True(t, service.IsExist("/_test/index.html"))
	assert.False(t, service.IsExist("/_test/index2.html"))
}

// func TestDelete(t *testing.T) {
// 	err := service.Delete("/_test/index.html")
// 	assert.Nil(t, err)
// }
//
// func TestDeletes(t *testing.T) {
// 	err := service.Deletes([]string{
// 		"/_test/1.html",
// 		"/_test/2.html",
// 	})
// 	assert.Nil(t, err)
// }
//
// func TestDeleteAll(t *testing.T) {
// 	err := service.DeleteAll("/_test")
// 	assert.Nil(t, err)
// }
