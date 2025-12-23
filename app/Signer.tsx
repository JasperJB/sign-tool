"use client";

import React, { useState, useRef, useEffect } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Document, Page, pdfjs } from "react-pdf";
import Draggable from "react-draggable";
import SignatureCanvas from "react-signature-canvas";
import {
    Download, Type, PenTool, Calendar, X, UploadCloud,
    ChevronLeft, ChevronRight, Save, FileText, Check
} from "lucide-react";
import { saveAs } from "file-saver";

// Setup PDF Worker - moved inside or handled differently to stay SSR-safe
if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

// Types & Interface
type ElementType = "text" | "signature" | "date";

interface FormElement {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    value: string;
    width?: number;
    height?: number;
    page: number;
}

export default function Signer() {
    // --- State ---
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [elements, setElements] = useState<FormElement[]>([]);
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // --- Refs ---
    const sigPad = useRef<SignatureCanvas>(null);
    const pdfNodeRef = useRef<HTMLDivElement>(null);

    // Constants for rendering
    const VIEWPORT_WIDTH = 600; // Fixed width for the editor canvas

    // --- 1. File Upload Handler ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type !== "application/pdf") {
                alert("Please convert DOC/DOCX to PDF before uploading to ensure perfect layout.");
                return;
            }
            setPdfFile(file);
            const buffer = await file.arrayBuffer();
            setPdfBytes(buffer);
            setElements([]); // Reset elements
            setCurrentPage(1);
        }
    };

    // --- 2. Element Creators ---
    const addText = () => {
        setElements(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                type: "text",
                x: 50,
                y: 50,
                value: "Type here...",
                page: currentPage,
            },
        ]);
    };

    const addDate = (customDate?: string) => {
        const dateStr = customDate || new Date().toLocaleDateString();
        setElements(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                type: "date",
                x: 50,
                y: 100,
                value: dateStr,
                page: currentPage,
            },
        ]);
    };

    const addSignature = (dataUrl: string) => {
        setElements(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                type: "signature",
                x: 50,
                y: 150,
                value: dataUrl,
                width: 120,
                height: 60,
                page: currentPage,
            },
        ]);
        setIsSignatureModalOpen(false);
    };

    // --- 3. Export Logic (The Complex Part) ---
    const downloadPDF = async () => {
        if (!pdfBytes) return;
        setIsExporting(true);

        try {
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const pages = pdfDoc.getPages();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

            // Process every element
            for (const el of elements) {
                const pageIndex = el.page - 1;
                if (pageIndex < 0 || pageIndex >= pages.length) continue;

                const page = pages[pageIndex];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                // --- Coordinate Calculation ---
                // The PDF Viewer renders at VIEWPORT_WIDTH (600px).
                // We must scale our DOM coordinates (x,y) to PDF coordinates.
                const scaleFactor = pageWidth / VIEWPORT_WIDTH;

                // HTML (0,0) is Top-Left. PDF (0,0) is Bottom-Left.
                // We must flip the Y coordinate.

                const pdfX = el.x * scaleFactor;

                // For text: baseline is bottom. For images: anchor is bottom-left.
                // We account for element height in the flip to ensure visual match.
                const elementHeight = el.type === 'signature' ? (el.height || 0) : 14; // Approx height for text
                const pdfY = pageHeight - (el.y * scaleFactor) - (elementHeight * scaleFactor);

                if (el.type === "text" || el.type === "date") {
                    page.drawText(el.value, {
                        x: pdfX,
                        y: pdfY,
                        size: 14 * scaleFactor, // Scale font size too
                        font: font,
                        color: rgb(0, 0, 0),
                    });
                } else if (el.type === "signature") {
                    const pngImage = await pdfDoc.embedPng(el.value);
                    page.drawImage(pngImage, {
                        x: pdfX,
                        y: pdfY,
                        width: (el.width || 120) * scaleFactor,
                        height: (el.height || 60) * scaleFactor,
                    });
                }
            }

            const pdfBytesModified = await pdfDoc.save();
            // Cast to any to bypass strict type checking for Uint8Array<ArrayBufferLike> 
            // which is currently causing issues with BlobPart in some environments
            const blob = new Blob([pdfBytesModified as any], { type: "application/pdf" });
            saveAs(blob, `signed_document_${Date.now()}.pdf`);
        } catch (err) {
            console.error("Export failed:", err);
            alert("Failed to export PDF. Please check the console.");
        } finally {
            setIsExporting(false);
        }
    };

    // --- 4. Helpers ---
    const removeElement = (id: string) => {
        setElements(prev => prev.filter((el) => el.id !== id));
    };

    const updateElementPosition = (id: string, x: number, y: number) => {
        setElements(prev => prev.map((el) => (el.id === id ? { ...el, x, y } : el)));
    };

    const updateElementValue = (id: string, value: string) => {
        setElements(prev => prev.map((el) => (el.id === id ? { ...el, value } : el)));
    };

    // --- Render ---
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900 selection:bg-blue-100">

            {/* Navbar */}
            <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm h-16">
                <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-blue-200">
                        <FileText size={20} strokeWidth={2.5} />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-gray-800">DocSigner</h1>
                </div>

                {pdfFile && (
                    <div className="flex items-center gap-4 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                        <button
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="p-1 hover:bg-white hover:shadow-sm rounded-full transition-all disabled:opacity-30 text-gray-600"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="text-sm font-medium text-gray-600 w-16 text-center">
                            {currentPage} / {numPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                            disabled={currentPage === numPages}
                            className="p-1 hover:bg-white hover:shadow-sm rounded-full transition-all disabled:opacity-30 text-gray-600"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                )}

                <div>
                    {pdfFile && (
                        <button
                            onClick={downloadPDF}
                            disabled={isExporting}
                            className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl transition-all font-medium shadow-md hover:shadow-xl active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isExporting ? (
                                <span className="animate-pulse">Processing...</span>
                            ) : (
                                <>
                                    <Download size={18} /> Export
                                </>
                            )}
                        </button>
                    )}
                </div>
            </nav>

            {/* Main Content */}
            <main className="flex-1 flex overflow-hidden">

                {/* Sidebar */}
                {pdfFile && (
                    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-4">Insert Elements</h2>
                            <div className="grid gap-3">
                                <button
                                    onClick={() => setIsSignatureModalOpen(true)}
                                    className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-md hover:text-blue-600 transition-all text-left group"
                                >
                                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                        <PenTool size={18} />
                                    </div>
                                    <span className="font-medium text-gray-700 group-hover:text-blue-700">Signature</span>
                                </button>

                                <button
                                    onClick={addText}
                                    className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-md hover:text-blue-600 transition-all text-left group"
                                >
                                    <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <Type size={18} />
                                    </div>
                                    <span className="font-medium text-gray-700 group-hover:text-emerald-700">Text</span>
                                </button>

                                <button
                                    onClick={() => addDate()}
                                    className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-md hover:text-blue-600 transition-all text-left group"
                                >
                                    <div className="bg-purple-50 p-2 rounded-lg text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                        <Calendar size={18} />
                                    </div>
                                    <span className="font-medium text-gray-700 group-hover:text-purple-700">Date (Today)</span>
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            <h2 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-4">Custom Date</h2>
                            <input
                                type="date"
                                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 hover:bg-white transition-colors"
                                onChange={(e) => {
                                    if (e.target.value) addDate(e.target.value)
                                }}
                            />
                        </div>

                        <div className="mt-auto p-6 border-t border-gray-100 bg-gray-50">
                            <p className="text-xs text-gray-400 leading-relaxed">
                                Drag and drop elements onto the page. Double check positions before exporting.
                            </p>
                        </div>
                    </aside>
                )}

                {/* Workspace / Dropzone */}
                <div className="flex-1 bg-gray-100 overflow-auto flex justify-center p-8 relative scrollbar-thin scrollbar-thumb-gray-300">
                    {!pdfFile ? (
                        <div className="flex flex-col items-center justify-center h-full max-w-xl mx-auto animate-in fade-in zoom-in duration-500">
                            <div className="bg-white p-10 rounded-3xl shadow-xl border border-gray-100 w-full text-center">
                                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                                    <UploadCloud size={40} strokeWidth={1.5} />
                                </div>
                                <h3 className="text-2xl font-bold mb-3 text-gray-800">Upload Document</h3>
                                <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                                    Securely sign and fill PDFs in your browser. No data is ever saved to a server.
                                </p>

                                <label className="block w-full group">
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                    />
                                    <div className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl cursor-pointer shadow-lg shadow-blue-200 group-hover:bg-blue-700 group-hover:scale-[1.02] transition-all flex items-center justify-center gap-2">
                                        <UploadCloud size={20} /> Select PDF File
                                    </div>
                                </label>
                                <p className="text-xs text-gray-400 mt-6">
                                    Supports standard PDFs.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="relative shadow-2xl border border-gray-200" ref={pdfNodeRef}>
                            <Document
                                file={pdfFile}
                                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                loading={<div className="h-96 w-96 flex items-center justify-center text-gray-400">Loading...</div>}
                            >
                                <Page
                                    pageNumber={currentPage}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    className="bg-white"
                                    width={VIEWPORT_WIDTH}
                                />
                            </Document>

                            {/* Elements Overlay */}
                            {elements.filter(el => el.page === currentPage).map((el) => (
                                <Draggable
                                    key={el.id}
                                    defaultPosition={{ x: el.x, y: el.y }}
                                    onStop={(e, data) => updateElementPosition(el.id, data.x, data.y)}
                                    bounds="parent"
                                >
                                    <div className="absolute cursor-move group z-10 p-1" style={{ top: 0, left: 0 }}>
                                        {/* Delete Button */}
                                        <div
                                            className="absolute -top-3 -right-3 hidden group-hover:flex bg-red-500 text-white rounded-full p-1.5 shadow-md cursor-pointer hover:bg-red-600 transition-colors z-20"
                                            onClick={() => removeElement(el.id)}
                                        >
                                            <X size={10} />
                                        </div>

                                        {el.type === "text" || el.type === "date" ? (
                                            <input
                                                value={el.value}
                                                onChange={(e) => updateElementValue(el.id, e.target.value)}
                                                className="bg-transparent hover:bg-blue-50/50 border border-transparent hover:border-blue-300 hover:border-dashed rounded p-1 text-lg font-sans outline-none w-auto min-w-[120px] text-gray-900 placeholder-gray-400"
                                                style={{ fontSize: '14px' }}
                                            />
                                        ) : (
                                            <div className="border border-transparent hover:border-blue-300 hover:border-dashed p-0.5 rounded transition-colors">
                                                <img
                                                    src={el.value}
                                                    alt="signature"
                                                    className="pointer-events-none select-none"
                                                    style={{ width: el.width, height: el.height }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </Draggable>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Signature Modal */}
            {isSignatureModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform scale-100 transition-all">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-800 text-lg">Create Signature</h3>
                            <button
                                onClick={() => setIsSignatureModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 hover:border-blue-400 transition-colors relative">
                                <SignatureCanvas
                                    ref={sigPad}
                                    canvasProps={{ className: "w-full h-48 rounded-2xl cursor-crosshair" }}
                                    velocityFilterWeight={0.7}
                                    minWidth={1.5}
                                    maxWidth={3.5}
                                />
                                <div className="absolute pointer-events-none inset-0 flex items-center justify-center text-gray-300 opacity-20 text-4xl font-bold select-none">
                                    SIGN HERE
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 mt-4 text-center">
                                Draw your signature above with your mouse or trackpad.
                            </p>
                        </div>

                        <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                            <button
                                onClick={() => sigPad.current?.clear()}
                                className="px-5 py-2.5 text-gray-600 hover:bg-gray-200 rounded-xl text-sm font-semibold transition-colors"
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => {
                                    if (sigPad.current && !sigPad.current.isEmpty()) {
                                        addSignature(sigPad.current.getTrimmedCanvas().toDataURL('image/png'));
                                    }
                                }}
                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black transition-all shadow-lg shadow-gray-200 flex items-center gap-2"
                            >
                                <Check size={16} /> Use Signature
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
