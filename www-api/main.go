package main

import (
	"github.com/get3w/get3w/www-api/api"
	"github.com/get3w/get3w/www-api/api/apps"
	"github.com/get3w/get3w/www-api/api/apps/files"
	"github.com/get3w/get3w/www-api/api/apps/folders"
	"github.com/get3w/get3w/www-api/api/status"

	log "github.com/Sirupsen/logrus"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
)

func main() {
	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(api.StoreHeaders())

	e.SetHTTPErrorHandler(func(err error, c *echo.Context) {
		if he, ok := err.(*echo.HTTPError); ok {
			api.Error(c, he.Code(), he)
		} else {
			api.ErrorInternal(c, err)
		}
	})

	e.Get("/static/proxy.html", api.StaticProxy)
	e.Get("/static/xdomain.min.js", api.StaticXDomain)

	// Apps Files start
	e.Post("/api/apps/:app_path/files/actions/checksum", files.Checksum)
	e.Post("/api/apps/:app_path/files/actions/push", files.Push)
	e.Delete("/api/apps/:app_path/files/*", files.Delete)
	e.Put("/api/apps/:app_path/files/*", files.Edit)
	e.Get("/api/apps/:app_path/*", files.Get)
	e.Get("/api/apps/:app_path/files", files.List)
	e.Get("/api/apps/:app_path/files/*", files.List)

	// Apps Folders start
	e.Post("/api/apps/:app_path/folders", folders.Create)
	e.Delete("/api/apps/:app_path/folders", folders.Delete)

	// Apps start
	// e.Post("/api/apps", apps.Create)
	e.Delete("/api/apps/:app_path", apps.Delete)
	// e.Patch("/api/apps/:app_path", apps.Edit)
	e.Get("/api/apps/:app_path", apps.Get)
	e.Get("/api/apps", apps.List)
	e.Post("/api/apps/:app_path/actions/load", apps.Load)
	e.Post("/api/apps/:app_path/actions/publish", apps.Publish)
	e.Post("/api/apps/:app_path/actions/save", apps.Save)
	// e.Post("/api/apps/:app_path/actions/star", apps.Star)

	// Status start
	e.Get("/api/status", status.Get)

	e.Static("/*", "E:\\get3w-js\\public\\get3w\\")

	e.Run(port)
}

var port string

func init() {
	log.SetFormatter(&log.JSONFormatter{})
	port = ":49393"
}
