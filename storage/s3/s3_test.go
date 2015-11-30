package s3

import (
	"log"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
)

var service, _ = NewService("app-source", "app-build", "local", "local")

func TestNewService(t *testing.T) {
	_, err := NewService("app-source", "app-build", "local", "")
	assert.NotNil(t, err)
	_, err = NewService("app-source", "app-build", "owner", "name")
	assert.Nil(t, err)
}

func TestGetAppPrefix(t *testing.T) {
	assert.Equal(t, service.getAppPrefix(""), "local/local/")
	assert.Equal(t, service.getAppPrefix("/"), "local/local/")
	assert.Equal(t, service.getAppPrefix("/test"), "local/local/test/")
	assert.Equal(t, service.getAppPrefix("test"), "local/local/test/")
}

func TestGetAppKey(t *testing.T) {
	assert.Equal(t, service.getAppKey("/test"), "local/local/test")
	assert.Equal(t, service.getAppKey("test"), "local/local/test")
}

func TestGetAllKeys(t *testing.T) {
	keys, err := service.getAllKeys("/")
	log.Println(len(keys))
	assert.Nil(t, err)
	assert.True(t, len(keys) > 0)
}

func TestGetFiles(t *testing.T) {
	files, err := service.GetFiles("/")
	log.Println(len(files))
	assert.Nil(t, err)
	assert.True(t, len(files) > 0)
}

func TestGetAllFiles(t *testing.T) {
	files, err := service.GetAllFiles()
	log.Println(len(files))
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

func TestChecksum(t *testing.T) {
	checksum, err := service.Checksum("/_test/index.html")
	assert.Nil(t, err)
	log.Println(checksum)
	assert.NotEmpty(t, checksum)
}

func TestRead(t *testing.T) {
	content, err := service.Read("/_test/index.html")
	log.Println(content)
	assert.Nil(t, err)
}

func TestUpload(t *testing.T) {
	path, _ := filepath.Abs("s3_test.go")
	log.Println(path)
	err := service.Upload("/_test/s3_test.go", path)
	assert.Nil(t, err)
}

func TestDownload(t *testing.T) {
	path, _ := filepath.Abs("./_test")
	log.Println(path)
	err := service.Download("/_test/index.html", path)
	assert.Nil(t, err)
}

func TestIsExist(t *testing.T) {
	assert.True(t, service.IsExist("/_test/index.html"))
	assert.False(t, service.IsExist("/_test/index2.html"))
}

func TestDelete(t *testing.T) {
	err := service.Delete("/_test/index.html")
	assert.Nil(t, err)
}

func TestDeletes(t *testing.T) {
	err := service.Deletes([]string{
		"/_test/1.html",
		"/_test/2.html",
	})
	assert.Nil(t, err)
}

func TestDeleteAll(t *testing.T) {
	err := service.DeleteAll("/_test")
	assert.Nil(t, err)
}
